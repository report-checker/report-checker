use pdfium_render::prelude::{
    PdfPage, PdfPageObject, PdfPageObjectCommon, PdfPageObjectType, PdfPageTextChar,
    PdfPageTextRenderMode, Pdfium, PdfPageObjectsCommon, PdfRect as PdfiumRect,
};
use std::path::PathBuf;

use super::types::{
    Bounds, ParsedPageObject, ParsedPageObjectType, ParsedPdfPage, ParsedPdfResult, ParsedTextRun,
    PdfRect, RgbColor,
};

const LINE_CLUSTER_MIN_TOLERANCE_PT: f32 = 2.0;
const LINE_CLUSTER_MAX_TOLERANCE_PT: f32 = 8.0;
const SPACE_GAP_MIN_THRESHOLD_PT: f32 = 1.5;
const SPACE_GAP_MAX_THRESHOLD_PT: f32 = 6.0;
const PAGE_OBJECT_MIN_WIDTH_PT: f32 = 24.0;
const PAGE_OBJECT_MIN_HEIGHT_PT: f32 = 24.0;
const PAGE_OBJECT_MIN_AREA_PT2: f32 = 600.0;

pub(super) fn parse_pdf_with_pdfium(pdf_bytes: &[u8]) -> Result<ParsedPdfResult, String> {
    let bindings = bind_pdfium().map_err(|error| format!("PDFium binding failed: {error}"))?;
    let pdfium = Pdfium::new(bindings);
    let document = pdfium
        .load_pdf_from_byte_slice(pdf_bytes, None)
        .map_err(|error| format!("Failed to open PDF with PDFium: {error}"))?;

    let mut pages: Vec<ParsedPdfPage> = Vec::with_capacity(document.pages().len() as usize);
    let mut margin_bounds_by_page: Vec<Option<PdfRect>> =
        Vec::with_capacity(document.pages().len() as usize);
    let mut text_boxes_by_page: Vec<Vec<PdfRect>> =
        Vec::with_capacity(document.pages().len() as usize);

    for (page_index, page) in document.pages().iter().enumerate() {
        let parsed_page = extract_page_with_pdfium(&page);

        margin_bounds_by_page.push(parsed_page.bounds.map(bounds_to_rect));
        text_boxes_by_page.push(
            parsed_page
                .text_boxes
                .into_iter()
                .map(bounds_to_rect)
                .collect(),
        );
        pages.push(ParsedPdfPage {
            page_number: page_index + 1,
            page_box: Some(page_box_to_rect(&page)),
            text_runs: parsed_page.text_runs,
            page_objects: parsed_page.page_objects,
        });
    }

    let page_count = pages.len();
    let measured_pages = margin_bounds_by_page
        .iter()
        .filter(|bounds| bounds.is_some())
        .count();
    let note = if measured_pages == 0 {
        Some("PDFium не вернул координаты текста ни на одной странице.".to_string())
    } else if measured_pages < page_count {
        Some(format!(
            "PDFium определил границы текста на {measured_pages} из {page_count} страниц."
        ))
    } else {
        None
    };

    Ok(ParsedPdfResult {
        page_count,
        pages,
        margin_bounds_by_page,
        pdfium_text_boxes_by_page: text_boxes_by_page,
        parser_engine_label: "PDFium".to_string(),
        parser_note: note,
    })
}

#[derive(Debug, Clone)]
struct PdfiumParsedPage {
    bounds: Option<Bounds>,
    text_boxes: Vec<Bounds>,
    text_runs: Vec<ParsedTextRun>,
    page_objects: Vec<ParsedPageObject>,
}

#[derive(Debug, Clone)]
struct PageChar {
    unicode: char,
    rect: Option<CharRect>,
    font_size_pt: Option<f32>,
    text_color_rgb: Option<RgbColor>,
}

#[derive(Debug, Clone, Copy)]
struct CharRect {
    left: f32,
    right: f32,
    bottom: f32,
    top: f32,
    center_y: f32,
    height: f32,
}

#[derive(Debug, Clone)]
struct LineStats {
    center_y_sum: f32,
    center_y_count: usize,
    min_x: f32,
    max_x: f32,
    min_y: f32,
    max_y: f32,
    member_indices: Vec<usize>,
}

impl LineStats {
    fn center_y(&self) -> f32 {
        self.center_y_sum / self.center_y_count.max(1) as f32
    }

    fn bounds(&self) -> Option<Bounds> {
        if !self.min_x.is_finite()
            || !self.max_x.is_finite()
            || !self.min_y.is_finite()
            || !self.max_y.is_finite()
            || self.max_x <= self.min_x
            || self.max_y <= self.min_y
        {
            return None;
        }

        Some(Bounds::from_rect(
            self.min_x, self.min_y, self.max_x, self.max_y,
        ))
    }
}

fn extract_page_with_pdfium(page: &PdfPage<'_>) -> PdfiumParsedPage {
    let Ok(text) = page.text() else {
        return PdfiumParsedPage {
            bounds: None,
            text_boxes: Vec::new(),
            text_runs: Vec::new(),
            page_objects: extract_page_objects(page),
        };
    };

    let page_chars = collect_page_chars(&text.chars().iter().collect::<Vec<_>>());
    let lines = group_chars_into_lines(&page_chars);

    if lines.is_empty() {
        return PdfiumParsedPage {
            bounds: None,
            text_boxes: Vec::new(),
            text_runs: Vec::new(),
            page_objects: extract_page_objects(page),
        };
    }

    let mut text_boxes: Vec<Bounds> = Vec::with_capacity(lines.len());
    let mut text_runs: Vec<ParsedTextRun> = Vec::with_capacity(lines.len());

    for line in lines {
        let Some(bounds) = line.bounds() else {
            continue;
        };

        let text = build_line_text(&page_chars, &line.member_indices);
        if text.is_empty() {
            continue;
        }

        let font_size_pt = line_font_size(&page_chars, &line.member_indices).unwrap_or(0.0);
        let text_color_rgb = line_text_color(&page_chars, &line.member_indices);

        text_boxes.push(bounds);
        text_runs.push(ParsedTextRun {
            text,
            bounds: bounds_to_rect(bounds),
            font_size_pt,
            text_color_rgb,
        });
    }

    let bounds = merge_bounds(&text_boxes);

    PdfiumParsedPage {
        bounds,
        text_boxes,
        text_runs,
        page_objects: extract_page_objects(page),
    }
}

fn extract_page_objects(page: &PdfPage<'_>) -> Vec<ParsedPageObject> {
    let mut objects: Vec<ParsedPageObject> = Vec::new();

    for object in page.objects().iter() {
        collect_page_object_recursive(&object, &mut objects);
    }

    objects
}

fn collect_page_object_recursive(object: &PdfPageObject<'_>, out: &mut Vec<ParsedPageObject>) {
    let object_type = map_page_object_type(object.object_type());

    if object_type != ParsedPageObjectType::Text
        && object_type != ParsedPageObjectType::Unsupported
    {
        if let Ok(bounds) = object.bounds() {
            if let Some(rect) = pdfium_rect_to_rect(bounds.to_rect()) {
                if should_keep_page_object(&rect) {
                    out.push(ParsedPageObject {
                        object_type,
                        bounds: rect,
                    });
                }
            }
        }
    }

    if let Some(form_object) = object.as_x_object_form_object() {
        for child in form_object.iter() {
            collect_page_object_recursive(&child, out);
        }
    }
}

fn map_page_object_type(object_type: PdfPageObjectType) -> ParsedPageObjectType {
    match object_type {
        PdfPageObjectType::Unsupported => ParsedPageObjectType::Unsupported,
        PdfPageObjectType::Text => ParsedPageObjectType::Text,
        PdfPageObjectType::Path => ParsedPageObjectType::Path,
        PdfPageObjectType::Image => ParsedPageObjectType::Image,
        PdfPageObjectType::Shading => ParsedPageObjectType::Shading,
        PdfPageObjectType::XObjectForm => ParsedPageObjectType::XObjectForm,
    }
}

fn pdfium_rect_to_rect(rect: PdfiumRect) -> Option<PdfRect> {
    let left = rect.left().value;
    let right = rect.right().value;
    let bottom = rect.bottom().value;
    let top = rect.top().value;

    if !left.is_finite()
        || !right.is_finite()
        || !bottom.is_finite()
        || !top.is_finite()
        || right <= left
        || top <= bottom
    {
        return None;
    }

    Some(PdfRect {
        left,
        bottom,
        right,
        top,
    })
}

fn should_keep_page_object(bounds: &PdfRect) -> bool {
    let width = bounds.right - bounds.left;
    let height = bounds.top - bounds.bottom;
    let area = width * height;

    width >= PAGE_OBJECT_MIN_WIDTH_PT
        && height >= PAGE_OBJECT_MIN_HEIGHT_PT
        && area >= PAGE_OBJECT_MIN_AREA_PT2
}

fn collect_page_chars(characters: &[PdfPageTextChar<'_>]) -> Vec<PageChar> {
    let mut page_chars: Vec<PageChar> = Vec::with_capacity(characters.len());

    for character in characters {
        let Some(unicode) = character.unicode_char() else {
            continue;
        };

        if unicode.is_control() {
            continue;
        }

        let font_size_pt = finite_positive_font_size(character);
        let text_color_rgb = extract_text_color(character);
        let rect = visible_char_rect(character);

        page_chars.push(PageChar {
            unicode,
            rect,
            font_size_pt,
            text_color_rgb,
        });
    }

    page_chars
}

fn finite_positive_font_size(character: &PdfPageTextChar<'_>) -> Option<f32> {
    let size = character.scaled_font_size().value;

    if size.is_finite() && size > 0.0 {
        Some(size)
    } else {
        None
    }
}

fn extract_text_color(character: &PdfPageTextChar<'_>) -> Option<RgbColor> {
    let color = character.fill_color().ok()?;

    Some(RgbColor {
        r: f32::from(color.red()) / 255.0,
        g: f32::from(color.green()) / 255.0,
        b: f32::from(color.blue()) / 255.0,
    })
}

fn visible_char_rect(character: &PdfPageTextChar<'_>) -> Option<CharRect> {
    if !is_visible_character(character) {
        return None;
    }

    let rect = character
        .tight_bounds()
        .or_else(|_| character.loose_bounds())
        .ok()?;
    let left = rect.left().value;
    let right = rect.right().value;
    let bottom = rect.bottom().value;
    let top = rect.top().value;

    if !left.is_finite() || !right.is_finite() || !bottom.is_finite() || !top.is_finite() {
        return None;
    }

    if right <= left || top <= bottom {
        return None;
    }

    Some(CharRect {
        left,
        right,
        bottom,
        top,
        center_y: (bottom + top) / 2.0,
        height: (top - bottom).max(0.0),
    })
}

fn group_chars_into_lines(page_chars: &[PageChar]) -> Vec<LineStats> {
    let mut visible_chars: Vec<(usize, CharRect)> = page_chars
        .iter()
        .enumerate()
        .filter_map(|(index, page_char)| page_char.rect.map(|rect| (index, rect)))
        .collect();

    if visible_chars.is_empty() {
        return Vec::new();
    }

    let mut heights: Vec<f32> = visible_chars.iter().map(|(_, rect)| rect.height).collect();
    heights.retain(|height| *height > 0.0 && height.is_finite());

    let median_height = median(&mut heights).unwrap_or(10.0);
    let line_tolerance = (median_height * 0.45)
        .max(LINE_CLUSTER_MIN_TOLERANCE_PT)
        .min(LINE_CLUSTER_MAX_TOLERANCE_PT);

    visible_chars.sort_by(|(left_index, left_rect), (right_index, right_rect)| {
        let y_cmp = right_rect.center_y.total_cmp(&left_rect.center_y);
        if y_cmp != std::cmp::Ordering::Equal {
            return y_cmp;
        }

        let x_cmp = left_rect.left.total_cmp(&right_rect.left);
        if x_cmp != std::cmp::Ordering::Equal {
            return x_cmp;
        }

        left_index.cmp(right_index)
    });

    let mut lines: Vec<LineStats> = Vec::new();

    for (page_char_index, rect) in visible_chars {
        let mut best_index: Option<usize> = None;
        let mut best_distance = f32::INFINITY;

        for (line_index, line) in lines.iter().enumerate() {
            let distance = (line.center_y() - rect.center_y).abs();
            if distance <= line_tolerance && distance < best_distance {
                best_distance = distance;
                best_index = Some(line_index);
            }
        }

        if let Some(line_index) = best_index {
            let line = &mut lines[line_index];
            line.center_y_sum += rect.center_y;
            line.center_y_count += 1;
            line.min_x = line.min_x.min(rect.left);
            line.max_x = line.max_x.max(rect.right);
            line.min_y = line.min_y.min(rect.bottom);
            line.max_y = line.max_y.max(rect.top);
            line.member_indices.push(page_char_index);
            continue;
        }

        lines.push(LineStats {
            center_y_sum: rect.center_y,
            center_y_count: 1,
            min_x: rect.left,
            max_x: rect.right,
            min_y: rect.bottom,
            max_y: rect.top,
            member_indices: vec![page_char_index],
        });
    }

    for line in &mut lines {
        line.member_indices.sort_unstable();
    }

    lines.sort_by(|left, right| {
        let y_cmp = right.center_y().total_cmp(&left.center_y());
        if y_cmp != std::cmp::Ordering::Equal {
            return y_cmp;
        }

        left.min_x.total_cmp(&right.min_x)
    });

    lines
}

fn build_line_text(page_chars: &[PageChar], member_indices: &[usize]) -> String {
    if member_indices.is_empty() {
        return String::new();
    }

    let mut text = String::new();
    let mut previous_index: Option<usize> = None;

    for member_index in member_indices {
        if let Some(previous_member_index) = previous_index {
            let slice_has_whitespace = page_chars
                .get(previous_member_index + 1..*member_index)
                .is_some_and(|slice| {
                    slice
                        .iter()
                        .any(|page_char| page_char.unicode.is_whitespace())
                });

            if slice_has_whitespace
                || inferred_word_gap(page_chars, previous_member_index, *member_index)
            {
                push_single_space(&mut text);
            }
        }

        text.push(page_chars[*member_index].unicode);
        previous_index = Some(*member_index);
    }

    normalize_line_text(&text)
}

fn inferred_word_gap(page_chars: &[PageChar], previous_index: usize, current_index: usize) -> bool {
    let Some(previous_rect) = page_chars
        .get(previous_index)
        .and_then(|page_char| page_char.rect)
    else {
        return false;
    };
    let Some(current_rect) = page_chars
        .get(current_index)
        .and_then(|page_char| page_char.rect)
    else {
        return false;
    };

    let gap = current_rect.left - previous_rect.right;
    let height = ((previous_rect.height + current_rect.height) / 2.0)
        .max(SPACE_GAP_MIN_THRESHOLD_PT)
        .min(SPACE_GAP_MAX_THRESHOLD_PT);

    gap > height * 0.33
}

fn push_single_space(text: &mut String) {
    if !text.ends_with(' ') && !text.is_empty() {
        text.push(' ');
    }
}

fn normalize_line_text(text: &str) -> String {
    let mut normalized = String::with_capacity(text.len());
    let mut last_was_space = false;

    for character in text.chars() {
        if character.is_whitespace() {
            if !last_was_space && !normalized.is_empty() {
                normalized.push(' ');
            }
            last_was_space = true;
            continue;
        }

        normalized.push(character);
        last_was_space = false;
    }

    normalized.trim().to_string()
}

fn line_font_size(page_chars: &[PageChar], member_indices: &[usize]) -> Option<f32> {
    let mut font_sizes: Vec<f32> = member_indices
        .iter()
        .filter_map(|member_index| page_chars.get(*member_index)?.font_size_pt)
        .filter(|font_size| font_size.is_finite() && *font_size > 0.0)
        .collect();

    median(&mut font_sizes)
}

fn line_text_color(page_chars: &[PageChar], member_indices: &[usize]) -> Option<RgbColor> {
    let mut first_color: Option<RgbColor> = None;

    for member_index in member_indices {
        let color = page_chars.get(*member_index)?.text_color_rgb?;
        if first_color.is_none() {
            first_color = Some(color);
        }

        if !is_black_rgb(color) {
            return Some(color);
        }
    }

    first_color
}

fn is_black_rgb(color: RgbColor) -> bool {
    color.r <= f32::EPSILON && color.g <= f32::EPSILON && color.b <= f32::EPSILON
}

fn is_visible_character(character: &PdfPageTextChar<'_>) -> bool {
    let Some(unicode) = character.unicode_char() else {
        return false;
    };

    if unicode.is_whitespace() || unicode.is_control() {
        return false;
    }

    if let Ok(render_mode) = character.render_mode() {
        if render_mode == PdfPageTextRenderMode::Invisible
            || render_mode == PdfPageTextRenderMode::InvisibleClipping
        {
            return false;
        }
    }

    true
}

fn page_box_to_rect(page: &PdfPage<'_>) -> PdfRect {
    PdfRect {
        left: 0.0,
        bottom: 0.0,
        right: page.width().value,
        top: page.height().value,
    }
}

fn bounds_to_rect(bounds: Bounds) -> PdfRect {
    PdfRect {
        left: bounds.min_x,
        bottom: bounds.min_y,
        right: bounds.max_x,
        top: bounds.max_y,
    }
}

fn median(values: &mut [f32]) -> Option<f32> {
    if values.is_empty() {
        return None;
    }

    values.sort_by(|left, right| left.total_cmp(right));

    let mid = values.len() / 2;
    if values.len() % 2 == 1 {
        values.get(mid).copied()
    } else {
        let left = values.get(mid.saturating_sub(1)).copied()?;
        let right = values.get(mid).copied()?;
        Some((left + right) / 2.0)
    }
}

fn merge_bounds(boxes: &[Bounds]) -> Option<Bounds> {
    if boxes.is_empty() {
        return None;
    }

    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;

    for bounds in boxes {
        min_x = min_x.min(bounds.min_x);
        min_y = min_y.min(bounds.min_y);
        max_x = max_x.max(bounds.max_x);
        max_y = max_y.max(bounds.max_y);
    }

    if !min_x.is_finite()
        || !min_y.is_finite()
        || !max_x.is_finite()
        || !max_y.is_finite()
        || max_x <= min_x
        || max_y <= min_y
    {
        return None;
    }

    Some(Bounds::from_rect(min_x, min_y, max_x, max_y))
}

fn bind_pdfium() -> Result<Box<dyn pdfium_render::prelude::PdfiumLibraryBindings>, String> {
    if let Ok(path) = std::env::var("PDFIUM_LIB_PATH") {
        return Pdfium::bind_to_library(path)
            .map_err(|error| format!("failed to load PDFium from PDFIUM_LIB_PATH: {error}"));
    }

    if let Ok(dir) = std::env::var("PDFIUM_LIB_DIR") {
        let path = Pdfium::pdfium_platform_library_name_at_path(&dir);
        return Pdfium::bind_to_library(path)
            .map_err(|error| format!("failed to load PDFium from PDFIUM_LIB_DIR: {error}"));
    }

    let mut bundled_errors: Vec<String> = Vec::new();

    for candidate in bundled_pdfium_library_candidates() {
        if !candidate.is_file() {
            continue;
        }

        match Pdfium::bind_to_library(&candidate) {
            Ok(bindings) => return Ok(bindings),
            Err(error) => bundled_errors.push(format!("{}: {error}", candidate.to_string_lossy())),
        }
    }

    match Pdfium::bind_to_system_library() {
        Ok(bindings) => Ok(bindings),
        Err(system_error) => {
            if bundled_errors.is_empty() {
                Err(format!(
                    "failed to load system PDFium library: {system_error}"
                ))
            } else {
                Err(format!(
                    "failed to load bundled PDFium library. attempts: {}; failed to load system PDFium library: {system_error}",
                    bundled_errors.join(" | ")
                ))
            }
        }
    }
}

fn bundled_pdfium_library_candidates() -> Vec<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    let relative_bundle = PathBuf::from("vendor")
        .join("pdfium")
        .join(pdfium_target_directory_name())
        .join(pdfium_library_filename());

    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("src-tauri").join(&relative_bundle));
        candidates.push(cwd.join(&relative_bundle));
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            candidates.push(exe_dir.join(&relative_bundle));
            candidates.push(exe_dir.join("resources").join(&relative_bundle));
            candidates.push(exe_dir.join("..").join("Resources").join(&relative_bundle));
            candidates.push(exe_dir.join("..").join("resources").join(&relative_bundle));
        }
    }

    dedupe_paths(candidates)
}

fn dedupe_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut seen: Vec<PathBuf> = Vec::new();
    for path in paths {
        if !seen.iter().any(|existing| existing == &path) {
            seen.push(path);
        }
    }
    seen
}

#[cfg(target_os = "macos")]
fn pdfium_library_filename() -> &'static str {
    "libpdfium.dylib"
}

#[cfg(target_os = "linux")]
fn pdfium_library_filename() -> &'static str {
    "libpdfium.so"
}

#[cfg(target_os = "windows")]
fn pdfium_library_filename() -> &'static str {
    "pdfium.dll"
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
fn pdfium_library_filename() -> &'static str {
    "libpdfium.so"
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
fn pdfium_target_directory_name() -> &'static str {
    "darwin-arm64"
}

#[cfg(all(target_os = "macos", target_arch = "x86_64"))]
fn pdfium_target_directory_name() -> &'static str {
    "darwin-x86_64"
}

#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
fn pdfium_target_directory_name() -> &'static str {
    "linux-x86_64"
}

#[cfg(all(target_os = "linux", target_arch = "aarch64"))]
fn pdfium_target_directory_name() -> &'static str {
    "linux-aarch64"
}

#[cfg(all(target_os = "windows", target_arch = "x86_64"))]
fn pdfium_target_directory_name() -> &'static str {
    "windows-x86_64"
}

#[cfg(all(target_os = "windows", target_arch = "x86"))]
fn pdfium_target_directory_name() -> &'static str {
    "windows-i686"
}

#[cfg(not(any(
    all(target_os = "macos", target_arch = "aarch64"),
    all(target_os = "macos", target_arch = "x86_64"),
    all(target_os = "linux", target_arch = "x86_64"),
    all(target_os = "linux", target_arch = "aarch64"),
    all(target_os = "windows", target_arch = "x86_64"),
    all(target_os = "windows", target_arch = "x86")
)))]
fn pdfium_target_directory_name() -> &'static str {
    "unsupported"
}

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsePdfInput {
    pub pdf_bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedPdfResult {
    pub page_count: usize,
    pub pages: Vec<ParsedPdfPage>,
    pub margin_bounds_by_page: Vec<Option<PdfRect>>,
    pub pdfium_text_boxes_by_page: Vec<Vec<PdfRect>>,
    pub parser_engine_label: String,
    pub parser_note: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedPdfPage {
    pub page_number: usize,
    pub page_box: Option<PdfRect>,
    pub text_runs: Vec<ParsedTextRun>,
    pub page_objects: Vec<ParsedPageObject>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedTextRun {
    pub text: String,
    pub bounds: PdfRect,
    pub font_size_pt: f32,
    pub text_color_rgb: Option<RgbColor>,
}

#[derive(Debug, Copy, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ParsedPageObjectType {
    Unsupported,
    Text,
    Path,
    Image,
    Shading,
    XObjectForm,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedPageObject {
    pub object_type: ParsedPageObjectType,
    pub bounds: PdfRect,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RgbColor {
    pub r: f32,
    pub g: f32,
    pub b: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfRect {
    pub left: f32,
    pub bottom: f32,
    pub right: f32,
    pub top: f32,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct Bounds {
    pub(crate) min_x: f32,
    pub(crate) max_x: f32,
    pub(crate) min_y: f32,
    pub(crate) max_y: f32,
}

impl Bounds {
    pub(crate) fn from_rect(min_x: f32, min_y: f32, max_x: f32, max_y: f32) -> Self {
        Self {
            min_x,
            max_x,
            min_y,
            max_y,
        }
    }
}

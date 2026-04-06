mod margin_geometry;
mod types;

use self::margin_geometry::parse_pdf_with_pdfium;
use self::types::ParsePdfInput;

#[tauri::command]
pub fn parse_pdf_report(input: ParsePdfInput) -> Result<self::types::ParsedPdfResult, String> {
    parse_pdf_with_pdfium(&input.pdf_bytes)
}

#[cfg(test)]
mod tests {
    use std::{fs, path::PathBuf};

    use super::parse_pdf_report;
    use super::types::ParsePdfInput;

    #[test]
    fn example_report_3_has_non_trivial_font_sizes() {
        let pdf_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("example-reports")
            .join("3.pdf");

        if !pdf_path.exists() {
            return;
        }

        let bytes = fs::read(&pdf_path).expect("failed to read example-reports/3.pdf");
        let parsed = parse_pdf_report(ParsePdfInput { pdf_bytes: bytes })
            .expect("failed to parse example-reports/3.pdf");

        let run_sizes: Vec<f32> = parsed
            .pages
            .iter()
            .flat_map(|page| page.text_runs.iter())
            .map(|run| run.font_size_pt)
            .filter(|size| size.is_finite() && *size > 0.0)
            .collect();

        assert!(
            !run_sizes.is_empty(),
            "no text runs with positive font size were extracted from example-reports/3.pdf"
        );

        let non_trivial_count = run_sizes.iter().filter(|size| **size >= 5.0).count();
        assert!(
            non_trivial_count > 0,
            "all extracted sizes look too small; max={:.3}",
            run_sizes.iter().copied().fold(0.0f32, f32::max)
        );
    }
}

use std::env;
use std::fs;

#[path = "../pdf_checker/margin_geometry.rs"]
mod margin_geometry;
#[path = "../pdf_checker/types.rs"]
mod types;

use margin_geometry::parse_pdf_with_pdfium;

fn main() {
    let mut args = env::args().skip(1);
    let input_path = args.next().expect("usage: parse_dump <input.pdf> <output.json>");
    let output_path = args.next().expect("usage: parse_dump <input.pdf> <output.json>");

    let bytes = fs::read(&input_path).expect("failed to read input pdf");
    let parsed = parse_pdf_with_pdfium(&bytes).expect("parse_pdf_with_pdfium failed");

    let json = serde_json::to_string_pretty(&parsed).expect("failed to serialize parsed result");
    fs::write(&output_path, json).expect("failed to write output json");
}

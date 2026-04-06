mod pdf_checker;

use crate::pdf_checker::parse_pdf_report;

const DEFAULT_CONFIG: &str = include_str!("../../src/lib/checker.config.json");

fn exe_dir() -> Result<std::path::PathBuf, String> {
    std::env::current_exe()
        .map_err(|e| e.to_string())
        .and_then(|p| p.parent().map(|d| d.to_path_buf()).ok_or_else(|| "exe has no parent dir".into()))
}

fn config_path() -> Result<std::path::PathBuf, String> {
    exe_dir().map(|d| d.join("checker.config.json"))
}

fn baselines_path() -> Result<std::path::PathBuf, String> {
    exe_dir().map(|d| d.join("baselines.json"))
}

#[tauri::command]
fn read_checker_config() -> Result<String, String> {
    let path = config_path()?;
    if path.exists() {
        return std::fs::read_to_string(path).map_err(|e| e.to_string());
    }
    Ok(DEFAULT_CONFIG.to_string())
}

#[tauri::command]
fn write_checker_config(content: String) -> Result<(), String> {
    std::fs::write(config_path()?, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_baselines() -> Result<String, String> {
    let path = baselines_path()?;
    if path.exists() {
        return std::fs::read_to_string(path).map_err(|e| e.to_string());
    }
    Ok("[]".to_string())
}

#[tauri::command]
fn write_baselines(content: String) -> Result<(), String> {
    std::fs::write(baselines_path()?, content).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            parse_pdf_report,
            read_checker_config,
            write_checker_config,
            read_baselines,
            write_baselines,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

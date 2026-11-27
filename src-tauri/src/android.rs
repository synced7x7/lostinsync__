use std::io::Write;
use tauri_plugin_dialog::FilePath;
use tauri_plugin_fs::{FsExt, OpenOptions};

pub fn write_picked(
    app: &tauri::AppHandle,
    file: FilePath,
    contents: &str,
) -> Result<Option<String>, String> {
    let mut opts = OpenOptions::new();
    opts.write(true).create(true).truncate(true);
    let mut f = app.fs().open(file.clone(), opts).map_err(|e| e.to_string())?;
    f.write_all(contents.as_bytes()).map_err(|e| e.to_string())?;
    Ok(Some(file.to_string()))
}

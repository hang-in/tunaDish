use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("{}: {}", path, e))
}

#[cfg(desktop)]
#[tauri::command]
fn open_branch_window(
    app: tauri::AppHandle,
    branch_id: String,
    conv_id: String,
    label: String,
    project_key: String,
) -> Result<(), String> {
    let short_id = &branch_id[..branch_id.len().min(8)];
    let window_label = format!("branch-{}", short_id);

    // If already open, just focus
    if let Some(existing) = app.get_webview_window(&window_label) {
        existing.set_focus().map_err(|e: tauri::Error| e.to_string())?;
        return Ok(());
    }

    let url_path = format!(
        "/?branch={}&conv={}&label={}&project={}",
        branch_id, conv_id, label, project_key
    );

    tauri::WebviewWindowBuilder::new(
        &app,
        &window_label,
        tauri::WebviewUrl::App(url_path.into()),
    )
    .title(format!("Branch: {}", label))
    .inner_size(900.0, 700.0)
    .min_inner_size(600.0, 400.0)
    .center()
    .decorations(false)
    .build()
    .map_err(|e: tauri::Error| e.to_string())?;

    Ok(())
}

#[cfg(desktop)]
#[tauri::command]
fn close_branch_window(app: tauri::AppHandle, branch_id: String) -> Result<(), String> {
    let short_id = &branch_id[..branch_id.len().min(8)];
    let window_label = format!("branch-{}", short_id);
    if let Some(window) = app.get_webview_window(&window_label) {
        window.close().map_err(|e: tauri::Error| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::new().build());

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            greet,
            open_branch_window,
            close_branch_window,
            read_text_file
        ]);

    #[cfg(mobile)]
    let builder = builder
        .invoke_handler(tauri::generate_handler![greet, read_text_file]);

    builder
        .setup(|_app| {
            #[cfg(target_os = "linux")]
            {
                if let Some(window) = _app.get_webview_window("main") {
                    if let Some(icon) = _app.default_window_icon() {
                        let _ = window.set_icon(icon.clone());
                    }
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

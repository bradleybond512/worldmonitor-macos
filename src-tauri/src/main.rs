#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![fetch_url])
        .setup(|app| {
            let window = app.get_webview_window("main");
            if let Some(win) = window {
                let _ = win.set_title("Bloomberg Terminal");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Fetch a URL from the Rust backend, bypassing browser CORS restrictions.
/// Used by the frontend to fetch RSS feeds, market data, and crypto prices.
#[tauri::command]
async fn fetch_url(url: String) -> Result<String, String> {
    // Validate the URL is HTTP(S)
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("Only HTTP(S) URLs are allowed".to_string());
    }

    let client = reqwest::Client::builder()
        .user_agent("BloombergTerminal/1.0 (compatible; macOS)")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }

    response.text().await.map_err(|e| e.to_string())
}

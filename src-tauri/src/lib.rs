// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::io::{Read, Write};
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SegmentReference {
    #[serde(rename = "assetId")]
    pub asset_id: String,
    #[serde(rename = "filePath")]
    pub file_path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Segment {
    pub id: String,
    pub index: i32,
    #[serde(rename = "startTime")]
    pub start_time: f64,
    #[serde(rename = "endTime")]
    pub end_time: f64,
    pub description: String,
    pub category: String,
    #[serde(default)]
    pub references: Vec<SegmentReference>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "clipPath")]
    pub clip_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "isCutError")]
    pub is_cut_error: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TextBlock {
    pub id: String,
    pub title: String,
    pub content: String,
    #[serde(rename = "blockType")]
    pub block_type: String,
    #[serde(rename = "sortOrder")]
    pub sort_order: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SceneBlock {
    pub id: String,
    #[serde(rename = "sceneInfo")]
    pub scene_info: String,
    #[serde(rename = "startSegmentIndex")]
    pub start_segment_index: i32,
    #[serde(rename = "endSegmentIndex")]
    pub end_segment_index: i32,
    pub summary: String,
    pub detail: String,
    #[serde(rename = "sortOrder")]
    pub sort_order: i32,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Metadata {
    #[serde(default)]
    pub title: String,
    #[serde(default, rename = "sourceUrl")]
    pub source_url: String,
    #[serde(default, rename = "videoId")]
    pub video_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AssetFile {
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<f64>,
    #[serde(rename = "type")]
    pub file_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Asset {
    pub id: String,
    pub name: String,
    pub category: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub detail: String,
    #[serde(default, rename = "createdAt")]
    pub created_at: String,
    #[serde(default)]
    pub files: Vec<AssetFile>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "subProjectData")]
    pub sub_project_data: Option<Box<Project>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Metadata>,
    #[serde(rename = "videoFilePath")]
    pub video_file_path: String,
    #[serde(rename = "proxyFilePath")]
    pub proxy_file_path: Option<String>,
    pub segments: Vec<Segment>,
    #[serde(rename = "textBlocks")]
    pub text_blocks: Vec<TextBlock>,
    #[serde(default, rename = "sceneBlocks")]
    pub scene_blocks: Vec<SceneBlock>,
    #[serde(default)]
    pub assets: Vec<Asset>,
    #[serde(rename = "subtitleFilePath")]
    pub subtitle_file_path: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

fn read_project_json(workspace_path: &Path) -> Result<(Project, Vec<u8>), String> {
    let project_json_path = workspace_path.join("project.json");
    if !project_json_path.exists() {
        return Err("project.json not found in workspace area".into());
    }

    let mut f = File::open(&project_json_path).map_err(|e| e.to_string())?;
    let mut buffer = Vec::new();
    f.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
    let project = serde_json::from_slice::<Project>(&buffer)
        .map_err(|e| format!("Failed to parse project.json before export: {e}"))?;
    Ok((project, buffer))
}

fn is_valid_segment_range(segment: &Segment) -> bool {
    segment.start_time.is_finite()
        && segment.end_time.is_finite()
        && segment.end_time > segment.start_time
}

fn validate_segment_clip_exports(project: &Project, workspace_path: &Path) -> Result<(), String> {
    for segment in &project.segments {
        if !is_valid_segment_range(segment) {
            continue;
        }

        let clip_path = segment.clip_path.as_deref().ok_or_else(|| {
            format!(
                "Segment #{} is missing its exported MP4 path. Please export the package again after clip generation completes.",
                segment.index
            )
        })?;

        if clip_path.trim().is_empty() {
            return Err(format!(
                "Segment #{} has an empty exported MP4 path.",
                segment.index
            ));
        }

        let absolute_clip_path = workspace_path.join(clip_path);
        if !absolute_clip_path.is_file() {
            return Err(format!(
                "Segment #{} exported MP4 is missing from workspace: {}",
                segment.index, clip_path
            ));
        }
    }

    Ok(())
}

#[tauri::command]
fn save_project(workspace: String, project: Project) -> Result<(), String> {
    let path = PathBuf::from(&workspace).join("project.json");
    let json = serde_json::to_string_pretty(&project).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_project(workspace: String) -> Result<Option<Project>, String> {
    let path = PathBuf::from(&workspace).join("project.json");
    if !path.exists() {
        return Ok(None);
    }
    let json = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let project: Project = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    Ok(Some(project))
}

#[tauri::command]
fn ensure_workspace_dirs(workspace: String) -> Result<(), String> {
    let base = PathBuf::from(&workspace);
    // Create the assets directory (replaces legacy screenshots/clips/thumbnails)
    let assets_dir = base.join("assets");
    if !assets_dir.exists() {
        fs::create_dir_all(&assets_dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn check_file_exists(path: String) -> bool {
    PathBuf::from(&path).exists()
}

#[tauri::command]
fn get_files_in_dir(dir_path: String) -> Result<Vec<String>, String> {
    let path = PathBuf::from(&dir_path);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let mut files = Vec::new();
    let entries = fs::read_dir(&path).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().map_err(|e| e.to_string())?.is_file() {
            if let Some(name) = entry.file_name().to_str() {
                files.push(name.to_string());
            }
        }
    }
    files.sort();
    Ok(files)
}

use axum::{
    extract::{Query, Request},
    http::header::{HeaderValue, ACCESS_CONTROL_ALLOW_ORIGIN},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use std::sync::atomic::{AtomicU16, Ordering};
use tower::ServiceExt;
use tower_http::services::ServeFile;

static SERVER_PORT: AtomicU16 = AtomicU16::new(0);

fn add_stream_cors_headers(response: &mut Response) {
    response
        .headers_mut()
        .insert(ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
}

#[derive(Deserialize)]
struct VideoQuery {
    path: String,
}

#[tauri::command]
fn get_stream_url(file_path: String) -> Result<String, String> {
    let port = SERVER_PORT.load(Ordering::SeqCst);
    if port == 0 {
        return Err("Local stream server not started yet".into());
    }
    
    // URL encode the path so it can be passed safely
    let encoded_path = urlencoding::encode(&file_path);
    Ok(format!("http://127.0.0.1:{}/stream?path={}", port, encoded_path))
}

async fn stream_handler(
    Query(q): Query<VideoQuery>,
    req: Request,
) -> Response {
    let serve_file = ServeFile::new(q.path);
    let mut response = serve_file.oneshot(req).await.into_response();
    // Timeline thumbnails draw the streamed video into a canvas. In dev the app
    // runs on localhost while media streams from 127.0.0.1, so the response must
    // be CORS-clean or canvas extraction is blocked by the browser.
    add_stream_cors_headers(&mut response);
    response
}

#[tauri::command]
async fn export_project_zip(workspace: String, output_path: String) -> Result<(), String> {
    let workspace_path = Path::new(&workspace);
    let (project, project_json_buffer) = read_project_json(workspace_path)?;
    validate_segment_clip_exports(&project, workspace_path)?;

    let output_file = File::create(&output_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(output_file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o755);

    // 1. Add project.json
    zip.start_file("project.json", options).map_err(|e| e.to_string())?;
    zip.write_all(&project_json_buffer).map_err(|e| e.to_string())?;

    // 2. Add assets directory recursively
    let assets_dir = workspace_path.join("assets");
    if assets_dir.exists() {
        let walkdir = WalkDir::new(&assets_dir);
        let it = walkdir.into_iter();

        for entry in it.filter_map(|e| e.ok()) {
            let path = entry.path();
            let name = path.strip_prefix(workspace_path).unwrap();
            let name_str = name.to_str().unwrap().replace("\\", "/"); // Normalize to Unix separators

            if path.is_file() {
                zip.start_file(name_str, options).map_err(|e| e.to_string())?;
                let mut f = File::open(path).map_err(|e| e.to_string())?;
                let mut buffer = Vec::new();
                f.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
                zip.write_all(&buffer).map_err(|e| e.to_string())?;
            } else if path.is_dir() && name_str.len() > 0 {
                // Ensure directories are correctly added to the zip structure
                let mut dir_name = name_str.clone();
                if !dir_name.ends_with('/') {
                    dir_name.push('/');
                }
                zip.add_directory(dir_name, options).map_err(|e| e.to_string())?;
            }
        }
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_asset_file(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if p.exists() && p.is_file() {
        fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn delete_asset_folder(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if p.exists() && p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|_app| {
            tauri::async_runtime::spawn(async {
                let app = Router::new().route("/stream", get(stream_handler));
                
                let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
                let port = listener.local_addr().unwrap().port();
                SERVER_PORT.store(port, Ordering::SeqCst);
                println!("Local video stream server listening on {}", port);
                
                axum::serve(listener, app).await.unwrap();
            });
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            save_project,
            load_project,
            ensure_workspace_dirs,
            check_file_exists,
            get_files_in_dir,
            get_stream_url,
            export_project_zip,
            delete_asset_file,
            delete_asset_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::StatusCode};
    use std::time::{SystemTime, UNIX_EPOCH};
    use zip::ZipArchive;

    #[test]
    fn stream_responses_are_cors_clean_for_canvas_thumbnails() {
        let mut response = Response::builder()
            .status(StatusCode::OK)
            .body(Body::empty())
            .expect("response");

        add_stream_cors_headers(&mut response);

        assert_eq!(
            response.headers().get(ACCESS_CONTROL_ALLOW_ORIGIN),
            Some(&HeaderValue::from_static("*")),
        );
    }

    #[tokio::test]
    async fn export_zip_fails_when_declared_segment_clip_is_missing() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let workspace = std::env::temp_dir().join(format!("dedream-export-missing-clip-{unique}"));
        fs::create_dir_all(workspace.join("assets")).expect("workspace assets");
        fs::write(
            workspace.join("project.json"),
            r#"{
              "videoFilePath": "media/movie.mp4",
              "proxyFilePath": "proxy.mp4",
              "segments": [{
                "id": "segment-1",
                "index": 1,
                "startTime": 0,
                "endTime": 4,
                "description": "",
                "category": "",
                "clipPath": "assets/segment_clips/segment_001.mp4"
              }],
              "textBlocks": [],
              "sceneBlocks": [],
              "assets": [],
              "createdAt": "2026-06-09T00:00:00.000Z",
              "updatedAt": "2026-06-09T00:00:00.000Z"
            }"#,
        )
        .expect("project json");

        let output_path = workspace.join("out.zip");
        let result = export_project_zip(
            workspace.to_string_lossy().to_string(),
            output_path.to_string_lossy().to_string(),
        )
        .await;

        assert!(
            result
                .expect_err("missing declared segment clip should fail export")
                .contains("assets/segment_clips/segment_001.mp4")
        );

        fs::remove_dir_all(workspace).ok();
    }

    #[tokio::test]
    async fn export_zip_includes_declared_segment_clip_file() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let workspace = std::env::temp_dir().join(format!("dedream-export-with-clip-{unique}"));
        let clip_dir = workspace.join("assets").join("segment_clips");
        fs::create_dir_all(&clip_dir).expect("segment clip dir");
        fs::write(clip_dir.join("segment_001.mp4"), b"fake mp4 bytes").expect("clip file");
        fs::write(
            workspace.join("project.json"),
            r#"{
              "videoFilePath": "media/movie.mp4",
              "proxyFilePath": "proxy.mp4",
              "segments": [{
                "id": "segment-1",
                "index": 1,
                "startTime": 0,
                "endTime": 4,
                "description": "",
                "category": "",
                "clipPath": "assets/segment_clips/segment_001.mp4"
              }],
              "textBlocks": [],
              "sceneBlocks": [],
              "assets": [],
              "createdAt": "2026-06-09T00:00:00.000Z",
              "updatedAt": "2026-06-09T00:00:00.000Z"
            }"#,
        )
        .expect("project json");

        let output_path = workspace.join("out.zip");
        export_project_zip(
            workspace.to_string_lossy().to_string(),
            output_path.to_string_lossy().to_string(),
        )
        .await
        .expect("export zip");

        let zip_file = File::open(&output_path).expect("zip file");
        let mut archive = ZipArchive::new(zip_file).expect("zip archive");
        archive
            .by_name("assets/segment_clips/segment_001.mp4")
            .expect("segment clip in zip");

        fs::remove_dir_all(workspace).ok();
    }
}

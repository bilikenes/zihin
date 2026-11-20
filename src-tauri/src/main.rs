// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  let mut args = std::env::args_os().skip(1);
  // Ayrı süreçte çalışan klavye hook'u: pencere açmaz, Tauri başlatmaz.
  if args.next().is_some_and(|a| a == "--expander-host") {
    if let Some(dir) = args.next() {
      app_lib::run_expander_host(dir.into());
    }
    return;
  }
  app_lib::run();
}

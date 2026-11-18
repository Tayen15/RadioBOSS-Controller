use std::fs;
use std::sync::{Arc, RwLock};

use serde_json::Value;

use crate::models::config::AppConfig;
use crate::services::db_service::DatabaseService;

/// Manages AppConfig loading, SQLite persistence, config.json mirroring, and legacy domain migration.
#[derive(Clone)]
pub struct SettingsService {
    db: DatabaseService,
    config: Arc<RwLock<AppConfig>>,
}

impl SettingsService {
    pub fn new(db: DatabaseService) -> Self {
        let mut loaded = Self::load_initial(&db);
        // Auto-migrate legacy Vercel URL to official custom domain
        let mut migrated = false;
        if loaded.casterhub_url == "https://radio-boss-controller.vercel.app"
            || loaded.casterhub_url.trim().is_empty()
        {
            loaded.casterhub_url = "https://rcb.oktaa.my.id".to_string();
            migrated = true;
        }

        let service = Self {
            db,
            config: Arc::new(RwLock::new(loaded.clone())),
        };
        if migrated {
            service.persist(&loaded);
        }
        service
    }

    fn load_initial(db: &DatabaseService) -> AppConfig {
        // 1. Try SQLite `settings` table first
        let map = db.get_all_settings();
        if !map.is_empty() {
            if let Ok(cfg) = serde_json::from_value::<AppConfig>(Value::Object(map)) {
                return cfg;
            }
        }

        // 2. Fallback to config.json in storage directory
        let config_file = db.storage_dir().join("config.json");
        if config_file.is_file() {
            if let Ok(raw) = fs::read_to_string(&config_file) {
                if let Ok(cfg) = serde_json::from_str::<AppConfig>(&raw) {
                    return cfg;
                }
            }
        }

        AppConfig::default()
    }

    pub fn get_config(&self) -> AppConfig {
        self.config.read().unwrap().clone()
    }

    pub fn update_config(&self, mut new_cfg: AppConfig) -> Result<AppConfig, String> {
        let old_data_dir = self.config.read().unwrap().custom_data_dir.clone();
        if new_cfg.custom_data_dir != old_data_dir {
            let relocated = self.db.relocate_storage(&new_cfg.custom_data_dir)?;
            if new_cfg.custom_data_dir.trim().is_empty() {
                new_cfg.custom_data_dir = String::new();
            } else {
                new_cfg.custom_data_dir = relocated.to_string_lossy().to_string();
            }
        }

        self.persist(&new_cfg);
        *self.config.write().unwrap() = new_cfg.clone();
        Ok(new_cfg)
    }

    fn persist(&self, cfg: &AppConfig) {
        if let Ok(Value::Object(map)) = serde_json::to_value(cfg) {
            self.db.save_all_settings(&map);
        }
        let config_file = self.db.storage_dir().join("config.json");
        if let Ok(pretty) = serde_json::to_string_pretty(cfg) {
            let _ = fs::write(config_file, pretty);
        }
    }
}

fn main() {
    #[cfg(target_os = "windows")]
    {
        if std::path::Path::new("assets/icon.ico").exists() {
            let mut res = winresource::WindowsResource::new();
            res.set_icon("assets/icon.ico");
            res.set("ProductName", "Radio Caster Bridge Studio");
            res.set("FileDescription", "Radio Caster Bridge Studio");
            res.set("InternalName", "RCBStudio");
            res.set("OriginalFilename", "RCBStudio.exe");
            res.set(
                "LegalCopyright",
                "Copyright (c) 2026 Radio Caster Bridge Studio - Tayen (hi.oktaa.my.id)",
            );
            if let Err(e) = res.compile() {
                println!("cargo:warning=Failed to compile Windows icon resource: {e}");
            }
        }
    }
}

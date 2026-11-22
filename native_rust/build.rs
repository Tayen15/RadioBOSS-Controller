fn main() {
    #[cfg(target_os = "windows")]
    {
        if std::path::Path::new("assets/icon.ico").exists() {
            let mut res = winresource::WindowsResource::new();
            res.set_icon("assets/icon.ico");
            res.set("ProductName", "CastDeck");
            res.set("FileDescription", "CastDeck");
            res.set("InternalName", "CastDeck");
            res.set("OriginalFilename", "CastDeck.exe");
            res.set(
                "LegalCopyright",
                "Copyright (c) 2026 CastDeck - Tayen (hi.oktaa.my.id)",
            );
            if let Err(e) = res.compile() {
                println!("cargo:warning=Failed to compile Windows icon resource: {e}");
            }
        }
    }
}

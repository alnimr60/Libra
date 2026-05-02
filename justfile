# --- CONFIGURATION (Update these 2 lines only) ---
app_name := "Libra"
bundle_id := "com.alnimr.libra"

# --- INTERNAL CONFIG ---
project := "ios/App/App.xcodeproj"
scheme := "App"
configuration := "Release"
archive_path := "build/App.xcarchive"
export_path := "build/ipa"

# Default: List tasks
default:
    @just --list

# Install all necessary iOS dependencies
setup:
    npm install @capacitor/core @capacitor/cli @capacitor/ios
    npx cap init "{{app_name}}" "{{bundle_id}}" --web-dir dist
    npx cap add ios

# Clean build artifacts
clean:
    @echo "Cleaning..."
    {{ if os_family() == "windows" { "if (Test-Path 'build') { Remove-Item -Recurse -Force 'build' }; if (Test-Path 'dist') { Remove-Item -Recurse -Force 'dist' }" } else { "rm -rf build dist" } }}

# Build web assets and sync to iOS
sync:
    npm run build
    npx cap sync ios

# Create Xcode Archive (Runs on Mac/GitHub)
archive: sync
    xcodebuild archive \
        -project {{project}} \
        -scheme {{scheme}} \
        -configuration {{configuration}} \
        -sdk iphoneos \
        -destination 'generic/platform=iOS' \
        -archivePath {{archive_path}} \
        CODE_SIGNING_ALLOWED=NO \
        CODE_SIGNING_REQUIRED=NO \
        CODE_SIGN_IDENTITY="" \
        ONLY_ACTIVE_ARCH=NO

# Bundle .app into .ipa (Works on Windows/Mac)
export-unsigned:
    @echo "Creating unsigned IPA..."
    {{ if os_family() == "windows" { 
        "$appPath = Get-ChildItem -Path '" + archive_path + "/Products/Applications' -Filter '*.app' -Recurse | Select-Object -First 1; " +
        "$payloadDir = '" + export_path + "/Payload'; " +
        "if (Test-Path $payloadDir) { Remove-Item -Recurse -Force $payloadDir }; " +
        "New-Item -ItemType Directory -Force -Path $payloadDir | Out-Null; " +
        "Copy-Item -Path $appPath.FullName -Destination $payloadDir -Recurse; " +
        "$ipaName = '" + app_name + "-Unsigned.ipa'; " +
        "if (Test-Path '" + export_path + "/$ipaName') { Remove-Item '" + export_path + "/$ipaName' }; " +
        "Compress-Archive -Path $payloadDir -DestinationPath '" + export_path + "/$ipaName'; " +
        "Remove-Item -Recurse -Force $payloadDir"
    } else {
        "APP_PATH=$(find " + archive_path + "/Products/Applications -name '*.app' | head -n 1); " +
        "mkdir -p " + export_path + "/Payload; " +
        "cp -r \"$APP_PATH\" " + export_path + "/Payload/; " +
        "cd " + export_path + "; " +
        "zip -r \"" + app_name + "-Unsigned.ipa\" Payload; " +
        "rm -rf Payload"
    } }}

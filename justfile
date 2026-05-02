# iOS Build Script
project := "ios/App/App.xcodeproj"
scheme := "App"
archive_path := "build/App.xcarchive"
export_path := "build/ipa"

# Build web code & sync to iOS
sync:
	npm run build
	npm run cap -- sync ios

# Archive (Runs on Mac)
archive: sync
	xcodebuild archive \
	    -project {{project}} \
	    -scheme {{scheme}} \
	    -configuration Release \
	    -sdk iphoneos \
	    -destination 'generic/platform=iOS' \
	    -archivePath {{archive_path}} \
	    CODE_SIGNING_ALLOWED=NO \
	    CODE_SIGNING_REQUIRED=NO \
	    CODE_SIGN_IDENTITY=""

# Export IPA
export-unsigned:
	APP_PATH=$(find {{archive_path}}/Products/Applications -name '*.app' | head -n 1); \
	mkdir -p {{export_path}}/Payload; \
	cp -r "$APP_PATH" {{export_path}}/Payload/; \
	cd {{export_path}}; \
	zip -r Libra-Unsigned.ipa Payload; \
	rm -rf Payload

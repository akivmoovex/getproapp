# V13 G60 — secure media

No media route, storage root, or kill switch was changed. `areMediaUploadsEnabled` is still false when the flag is absent. `validateMediaFile` still uses the file signature, rejects a mismatched claimed type, and strips a traversal name to a basename with no slash.

The new unit test covers a synthetic PNG whose filename is `../secret.png`, the disabled flag, and the closed production path. No file was written to storage. Real multipart HTTP and Playwright remain `NOT_RUN`.

```
MEDIA_UPLOAD_SOURCE=IMPLEMENTED_UNVERIFIED
MEDIA_UPLOAD_SECURITY=IMPLEMENTED_UNVERIFIED
PRODUCTION_MEDIA_UPLOADS=DISABLED
```

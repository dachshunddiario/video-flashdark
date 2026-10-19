# Privacy Policy - Flash Dark

**Effective Date:** October 19, 2026  
**Application:** Flash Dark  
**Developer / Owner:** Augusto Siqueira (`augustoSiqueira`)

---

### 1. Information We Collect
Flash Dark is designed as a local-first software application. 
- **Account Identification:** We store temporary OAuth tokens (`access_token`, `open_id`, user display name and profile picture) strictly to authenticate requests with the TikTok API and Meta Graph API.
- **Media Content:** Media files (images and videos) remain stored locally on your machine, with temporary CDN URLs generated solely for the duration required by platform servers to pull and ingest the post.
- **No Personal Data Selling:** We do not track, collect personal identity numbers, or sell user information to any third party or marketing service.

### 2. How Information is Used
The information collected is used exclusively to:
- Authenticate the user's TikTok or social media account.
- Schedule, upload, and publish video content directly to the user's authorized accounts upon their explicit command.

### 3. Data Storage and Security
All API keys and credentials are stored locally in the user's secured workspace environment (`data/` directory). Tokens are transmitted only through HTTPS encrypted connections directly to official endpoints (`open.tiktokapis.com` and `graph.facebook.com`).

### 4. Data Deletion and Revocation
Users can remove stored credentials at any time directly through the Flash Dark settings panel, or by revoking Flash Dark's authorization within their TikTok account settings (**Settings and Privacy > Security & Permissions > Manage app permissions**).

### 5. Contact
If you have any questions or data removal inquiries, please reach out via GitHub at [https://github.com/augustoSiqueira/video-flashdark](https://github.com/augustoSiqueira/video-flashdark).

VELOX CARS — PRODUCTION PACKAGE

This package contains the client website, secure Admin, Supabase integration, database schema and local server.

FILES
- velox_site_final.html       Public client website
- velox_admin_final.html      Admin panel
- config.js                   Supabase Project URL + public/anon key
- velox-client-bridge.js      Client <-> Supabase integration
- velox-admin-bridge.js       Admin <-> Supabase Auth/DB/Storage integration
- schema.sql                  Complete Supabase SQL schema + RLS + storage + seed fleet
- server.js                   Local static server
- package.json                Node start command
- start.bat                   Windows launcher

SETUP
1. Create a Supabase project.
2. In Supabase SQL Editor, run ALL of schema.sql.
3. Create an Admin user in Supabase Authentication > Users (email + password).
4. Open config.js and replace the two placeholders with the Supabase Project URL and Publishable/Anon key.
5. Never put a service_role/secret key in config.js.
6. Run `node server.js` or double-click start.bat on Windows.
7. Client: http://localhost:3000
8. Admin: http://localhost:3000/admin

HOSTING
GitHub Pages (static hosting):
1. Configure config.js with the Supabase Project URL and Publishable/Anon key.
2. Push this folder to a GitHub repository.
3. In the repository, open Settings > Pages and deploy from the main branch, root folder.
4. In Supabase Authentication URL Configuration, set Site URL to the deployed Pages URL and add that URL to the Redirect URLs allowlist. For a project site, the URL includes the repository name (https://OWNER.github.io/REPOSITORY/).
5. Public site: the Pages URL. Admin: add admin/ to the Pages URL.

The root index.html and admin/index.html are static entry points for GitHub Pages. GitHub Pages does not run server.js; it serves the HTML and JavaScript files directly. Supabase provides the online database, storage and authentication. The same static files can also be run locally with `node server.js` or start.bat.

SECURITY
The Admin uses Supabase Authentication. Customer data is not exposed to the public calendar; the public calendar RPC returns only car/date intervals.

IMPORTANT
This package is code-complete for the Supabase architecture, but it cannot connect to your private Supabase project until you fill config.js and create the Admin user. No password or secret key is required from you here.

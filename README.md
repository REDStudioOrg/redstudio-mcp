# RedStudio MCP

Claude or ChatGPT built your frontend. Now you need a backend: hosting, a shop, payments, bookings. That's RedStudio.

Connect this MCP server and your assistant puts the pages it built onto a hosted RedStudio site. Shop, Stripe payments, bookings and a blog come with it, so you don't wire up a backend yourself.

[Get started](https://redstudio.ie/register) · [Docs](https://redstudio.ie/mcp) · [Pricing](https://redstudio.ie/pricing)

## What you get

| | |
|---|---|
| **Hosting** | Your own domain, free SSL, nothing to deploy |
| **Online shop** | Physical and digital products, Stripe payments, shipping, tax, discount codes |
| **Bookings** | Free or paid appointments, Google Calendar sync, reminders |
| **Event tickets** | Ticket tiers, online sales, QR code check-in |
| **Blog** | Posts on your own domain, SEO-friendly URLs |
| **Contact forms** | reCAPTCHA spam protection, submissions by email |
| **Analytics** | Cookie-less, no consent banner needed |
| **Compliance** | Cookie consent, privacy and cookie policy templates |

Your assistant handles pages, navigation, images, booking hours and blog posts. You add products and events in the dashboard. Every page save is a revision you can roll back, and you can keep editing in the drag-and-drop builder.

From EUR 25 a month. One account, one website.

## Try asking

> Move the landing page you built for me onto my RedStudio site.

> Set up bookings: 30 minute consultations at 60 euro, weekdays 9 to 5.

> Write and publish three blog posts about recovering from a running injury.

## Quick start

1. Create an account at https://redstudio.ie/register (one account = one hosted website).
2. In the dashboard go to **API Keys**, create a key and tick **Site builder access**. The key only works for your site.
3. Add the server to your MCP client.

Claude Code:

```bash
claude mcp add redstudio -e REDSTUDIO_API_KEY=your-api-key -- npx -y redstudio-mcp
```

Claude Desktop, Cursor and other clients:

```json
{
  "mcpServers": {
    "redstudio": {
      "command": "npx",
      "args": ["-y", "redstudio-mcp"],
      "env": { "REDSTUDIO_API_KEY": "your-api-key" }
    }
  }
}
```

Requires Node.js 20 or newer.

## Local development

```bash
git clone https://github.com/REDStudioOrg/redstudio-mcp.git
cd redstudio-mcp
pnpm install
export REDSTUDIO_API_KEY=...            # required
export REDSTUDIO_API_URL=https://example.test/api/v1/external   # optional, defaults to production
node src/server.js
```

For a local server with a self-signed certificate also set `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## Tools reference

| Tool | What it does |
|------|--------------|
| `get_site`, `update_site` | Global CSS, head HTML, GDPR popup, theme colours, robots.txt, reCAPTCHA keys, site URL |
| `set_favicon`, `set_logo` | Favicon and logo uploads |
| `list_pages`, `get_page`, `create_page`, `update_page`, `delete_page` | Builder pages. `get_page` takes an id or a permalink |
| `list_components`, `get_component`, `create_component`, `update_component`, `delete_component` | `navigation`, `footer`, `signature` and reusable blocks |
| `list_redirects`, `create_redirect`, `delete_redirect` | Path redirects |
| `list_media`, `upload_media`, `delete_media` | Media library. `upload_media` takes a local `path` or a remote `url` |
| `get_booking_setup`, `update_booking_setup`, `create_meeting_type`, `update_meeting_type`, `delete_meeting_type` | Booking hours, buffers and meeting types |
| `list_posts`, `get_post`, `create_post`, `update_post` | Blog posts |

Updates are partial: only the fields you pass change. Every page/component save records a revision, exactly as the dashboard editor does.

## Tests

```bash
pnpm test
```

Unit tests stub `fetch`; nothing talks to a real server.

## License

MIT

# RedStudio MCP

**Describe the website you want. Your AI assistant builds it, and it's live.**

Connect Claude, Cursor, VS Code or any MCP client to [RedStudio](https://redstudio.ie) and your assistant builds a real, hosted website for you: pages, navigation, images, booking calendar and blog. You don't need a server, a deploy pipeline or a developer.

[Get started](https://redstudio.ie/register) · [Docs](https://redstudio.ie/mcp) · [Pricing](https://redstudio.ie/pricing)

## Why build on RedStudio

**Live today, not in six weeks.** Hosting, SSL and your own domain are part of every plan. Your assistant writes the pages, and they're live on your site the moment they're saved. There's nothing to deploy.

**Start selling straight away.** Your site comes with an online shop for physical and digital products, with secure Stripe payments, shipping rates, discount codes and order emails. Your assistant builds the pages, and you add products in the dashboard.

**Fill your calendar without the email back and forth.** Customers book and pay for appointments on your site. Your assistant can set your opening hours, buffers and meeting types for you, and bookings sync with Google Calendar.

**Sell tickets to your events.** Multiple ticket types, Stripe checkout, QR code tickets and a built-in scanner for the door.

**Get found on Google.** Your blog lives on your own domain, so every post builds your site's search ranking. Your assistant can write and publish posts for you.

**Stay compliant without hiring a lawyer.** Cookie consent, privacy and cookie policy templates, and cookie-less analytics that need no consent banner are all built in.

**Never locked into the chat window.** Everything your assistant builds can be edited afterwards in the drag-and-drop builder, by you or anyone on your team.

**Mistakes are one click to undo.** Every page save records a revision, so you can restore any earlier version from the page history.

**Your site and nothing else.** The API key only works for your own website, and you can revoke it at any time.

## Platform features

| | |
|---|---|
| **Online shop** | Physical and digital products, Stripe payments, shipping, tax, discount codes, refunds |
| **Appointment booking** | Free or paid bookings, Google Calendar and Google Meet, reminders, buffer times |
| **Event ticketing** | Ticket tiers, online sales, QR code check-in, attendee exports |
| **Blog** | SEO-friendly permalinks, drafts and archiving, AI writer |
| **Page builder** | Drag-and-drop editor, responsive pages, revision history |
| **Navigation builder** | Menus, call-to-action buttons, site-wide header and footer |
| **Contact forms** | reCAPTCHA spam protection, submissions by email and in the dashboard |
| **Analytics** | Cookie-less, GDPR friendly, monthly report by email |
| **Compliance** | Cookie consent banner, privacy and cookie policy templates |
| **Hosting and SSL** | Managed hosting, free SSL with automatic renewal, custom domain |

Plans start at EUR 25 a month. One account hosts one website. See [pricing](https://redstudio.ie/pricing).

## Try asking

> Build a five page website for my physiotherapy clinic in Cork: home, services, about, prices and contact. Use calm blues and greens.

> Set up online booking: 30 minute consultations at 60 euro, Monday to Friday 9 to 5, with 15 minutes between appointments.

> Upload the photos in ./photos and add a gallery to the about page.

> Write and publish three blog posts about recovering from a running injury.

> We moved /services to /treatments. Rename the page and redirect the old URL.

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

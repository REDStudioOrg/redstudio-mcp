import { z } from 'zod';
import { ApiError } from './client.js';

const id = z.number().int().positive().describe('Numeric id');
const permalink = z.string().min(1).max(80).describe('URL slug, lower-case letters, digits and dashes. "home" is the homepage.');
const html = z.string().describe('Full HTML of the page/component body (no <html>/<head>; Bootstrap 4.6 classes available). Links should be relative without a leading slash, e.g. href="about-us".');
const css = z.string().describe('CSS scoped to this page/component');
const js = z.string().describe('JavaScript for this page/component, run after DOMContentLoaded. Stored verbatim and treated as trusted owner code.');

const pageFields = {
  name: z.string().max(50).describe('Internal name shown in the dashboard'),
  description: z.string().max(200).optional(),
  title: z.string().max(200).optional().describe('<title> and SEO title'),
  keywords: z.string().max(500).optional().describe('Meta keywords, comma separated'),
  og_image: z.string().url().max(255).optional().describe('Open Graph image URL'),
  html: html.optional(),
  css: css.optional(),
  js: js.optional(),
  is_archived: z.boolean().optional(),
};

const componentFields = {
  name: z.string().max(50).describe('Internal name'),
  description: z.string().max(200).optional(),
  html: html.optional(),
  css: css.optional(),
  js: js.optional().describe('JavaScript. Note: only the navigation component JS runs on the public site; footer JS is not rendered.'),
};

const postFields = {
  title: z.string().max(200),
  body: z.string().max(65500).describe('HTML body'),
  subtitle: z.string().max(250).optional(),
  permalink: z.string().max(100).optional(),
  date: z.string().regex(/^\d{2}-\d{2}-\d{4}$/).optional().describe('dd-mm-yyyy'),
  draft: z.boolean().optional(),
  read_time: z.number().int().min(1).max(999).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
};

function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function fail(message) {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

function guard(fn) {
  return async (args) => {
    try {
      return ok(await fn(args));
    } catch (err) {
      if (err instanceof ApiError) {
        const detail = typeof err.body === 'string' ? err.body : JSON.stringify(err.body, null, 2);
        return fail(`RedStudio API error ${err.status}\n${detail}`);
      }
      return fail(err.message);
    }
  };
}

function partial(shape) {
  return Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, v.optional()]));
}

function stripUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

/**
 * Build the tool list for an MCP server. Each tool: { name, description,
 * inputSchema (zod shape), handler(args) -> MCP result }.
 */
export function buildTools(client) {
  const builderTools = (resource, singular, plural, extraFields, requirePermalink) => {
    const createShape = requirePermalink
      ? { ...extraFields, permalink }
      : { ...extraFields, permalink: permalink.optional().describe('Set to "navigation", "footer" or "signature" for the site-wide components; omit for a reusable block.') };

    return [
      {
        name: `list_${plural}`,
        description: `List the customer's ${plural} (summary only, no html/css/js). Use get_${singular} for content.`,
        inputSchema: {},
        handler: guard(() => client[resource].list()),
      },
      {
        name: `get_${singular}`,
        description: `Get one ${singular} with full html, css and js. Pass either id or permalink.`,
        inputSchema: { id: id.optional(), permalink: permalink.optional() },
        handler: guard(({ id: pageId, permalink: slug }) => {
          if (pageId !== undefined) return client[resource].get(pageId);
          if (slug) return client[resource].getByPermalink(slug);
          throw new Error('Provide id or permalink.');
        }),
      },
      {
        name: `create_${singular}`,
        description: `Create a ${singular}. ${requirePermalink ? 'The permalink becomes the public URL path ("home" for the homepage) and must be unique; reserved paths like shop, post, events, donate are rejected.' : 'Components are site-wide parts (navigation, footer, signature) or reusable blocks.'}`,
        inputSchema: createShape,
        handler: guard((args) => client[resource].create(stripUndefined(args))),
      },
      {
        name: `update_${singular}`,
        description: `Update a ${singular}. Only the fields you pass are changed; html, css and js are replaced wholesale when given. A revision is recorded.`,
        inputSchema: { id, ...partial(createShape) },
        handler: guard(({ id: pageId, ...rest }) => client[resource].update(pageId, stripUndefined(rest))),
      },
      {
        name: `delete_${singular}`,
        description: `Soft-delete a ${singular} by id.`,
        inputSchema: { id },
        handler: guard(({ id: pageId }) => client[resource].remove(pageId)),
      },
    ];
  };

  const tools = [
    {
      name: 'get_site',
      description: 'Get site-wide settings: customer, public site URL, global CSS, head JS and rendering settings (GDPR popup, theme colours, robots.txt, maintenance mode, reCAPTCHA public key).',
      inputSchema: {},
      handler: guard(() => client.site.get()),
    },
    {
      name: 'update_site',
      description: 'Update site-wide settings. Only provided fields change. global_css applies to every page; head_js is raw HTML injected into <head> (use it for <script>/<link> tags such as fonts and analytics).',
      inputSchema: {
        test_domain: z.string().min(2).max(50).optional().describe('Subdomain under the CMS host where the site is served for review, e.g. "saolcapital" -> saolcapital.<cms host>. Lower-case slug, must be unique.'),
        global_css: z.string().optional(),
        head_js: z.string().optional().describe('Raw <head> HTML: script and link tags'),
        enable_gdpr_popup: z.boolean().optional(),
        maintenance_mode: z.boolean().optional(),
        theme_colors: z.string().max(500).optional().describe('Comma-separated hex colours exposed as CSS variables'),
        robots_txt: z.string().max(5000).optional(),
        recaptcha_public_key: z.string().max(255).optional(),
        recaptcha_secret_key: z.string().max(255).optional().describe('Required for the built-in contact form endpoint (reCAPTCHA; v2 invisible or v3)'),
        blog_item_template: z.string().max(20000).optional().describe('HTML for one blog list item. Placeholders: {{title}} {{url}} {{date}} {{image}} {{read_time}} {{excerpt}} {{author}} {{subtitle}} {{tags}}; sections {{#image}}...{{/image}} and {{^image}}...{{/image}}. The first element gets class blog-post automatically. Empty = default article list.'),
        blog_list_class: z.string().max(255).optional().describe('Classes for the wrapper around the items, e.g. "row py-4"'),
        blog_date_format: z.string().max(30).optional().describe('PHP date format for {{date}}, e.g. "F jS"'),
        gdpr_config: z.object({
          barColor: z.string().optional(), barTextColor: z.string().optional(), barMainButtonColor: z.string().optional(),
          barMainButtonTextColor: z.string().optional(), modalMainButtonColor: z.string().optional(), modalMainButtonTextColor: z.string().optional(),
        }).optional().describe('Cookie banner colours as hex strings'),
      },
      handler: guard((args) => client.site.update(stripUndefined(args))),
    },
    {
      name: 'set_favicon',
      description: 'Upload the site favicon (png, ico, svg, jpg, gif, webp; max 2MB) from a local path or URL. Replaces the previous one.',
      inputSchema: { path: z.string().optional(), url: z.string().url().optional() },
      handler: guard((args) => client.site.setFavicon(stripUndefined(args))),
    },
    {
      name: 'set_logo',
      description: 'Upload the site logo image used by the CMS templates and email branding. Replaces the previous one.',
      inputSchema: { path: z.string().optional(), url: z.string().url().optional() },
      handler: guard((args) => client.site.setLogo(stripUndefined(args))),
    },
    ...builderTools('pages', 'page', 'pages', pageFields, true),
    ...builderTools('components', 'component', 'components', componentFields, false),
    {
      name: 'list_redirects',
      description: 'List path redirects (from_permalink -> to_permalink) for the site.',
      inputSchema: {},
      handler: guard(() => client.redirects.list()),
    },
    {
      name: 'create_redirect',
      description: 'Create or replace a redirect from one path to another. Checked before page lookup. http_code 301 (default) or 302.',
      inputSchema: {
        from_permalink: z.string().min(1).max(255),
        to_permalink: z.string().min(1).max(255).describe('Relative path or absolute URL'),
        http_code: z.union([z.literal(301), z.literal(302)]).optional(),
      },
      handler: guard((args) => client.redirects.create(stripUndefined(args))),
    },
    {
      name: 'delete_redirect',
      description: 'Delete a redirect by id.',
      inputSchema: { id },
      handler: guard(({ id: rid }) => client.redirects.remove(rid)),
    },
    {
      name: 'list_media',
      description: 'List the customer media library (images, PDFs) with public URLs to use in page HTML.',
      inputSchema: {},
      handler: guard(() => client.media.list()),
    },
    {
      name: 'upload_media',
      description: 'Upload an image or PDF (jpg, png, gif, svg, webp, pdf; max 10MB) from a local file path or a remote URL. Returns the public URL to reference in HTML.',
      inputSchema: {
        path: z.string().optional().describe('Absolute local file path'),
        url: z.string().url().optional().describe('Remote file URL to download and upload'),
        name: z.string().max(255).optional().describe('Display name in the media library'),
      },
      handler: guard((args) => client.media.upload(stripUndefined(args))),
    },
    {
      name: 'delete_media',
      description: 'Delete a media item by id. Pages referencing its URL will show a broken asset.',
      inputSchema: { id },
      handler: guard(({ id: mid }) => client.media.remove(mid)),
    },
    {
      name: 'get_booking_setup',
      description: 'Get the booking block setup: timezone, notice period, how far ahead people can book, buffers, weekly hours per day, and meeting types.',
      inputSchema: {},
      handler: guard(() => client.bookings.get()),
    },
    {
      name: 'update_booking_setup',
      description: 'Update booking settings and weekly hours. availability maps a day (MONDAY..SUNDAY) to a list of ["HH:MM","HH:MM"] ranges; a day sent replaces that day, [] closes it, days not sent are unchanged.',
      inputSchema: {
        timezone: z.string().optional().describe('IANA timezone, e.g. Europe/Dublin'),
        minimum_notice_hours: z.number().int().min(0).max(720).optional(),
        max_advance_days: z.number().int().min(1).max(730).optional(),
        buffer_before_minutes: z.number().int().min(0).max(240).optional(),
        buffer_after_minutes: z.number().int().min(0).max(240).optional(),
        availability: z.record(z.array(z.tuple([z.string(), z.string()]))).optional(),
      },
      handler: guard((args) => client.bookings.update(stripUndefined(args))),
    },
    {
      name: 'create_meeting_type',
      description: 'Create a bookable meeting type shown in the booking block.',
      inputSchema: { name: z.string().max(190), description: z.string().max(400).optional(), length: z.string().describe('HH:MM, e.g. 00:15'), cost: z.number().min(0).describe('0 for free'), enabled: z.boolean().optional() },
      handler: guard((args) => client.bookings.createEvent(stripUndefined(args))),
    },
    {
      name: 'update_meeting_type',
      description: 'Update a meeting type; only provided fields change. Set enabled=false to hide it.',
      inputSchema: { id, name: z.string().max(190).optional(), description: z.string().max(400).optional(), length: z.string().optional(), cost: z.number().min(0).optional(), enabled: z.boolean().optional() },
      handler: guard(({ id: eid, ...rest }) => client.bookings.updateEvent(eid, stripUndefined(rest))),
    },
    {
      name: 'delete_meeting_type',
      description: 'Delete a meeting type with no bookings (otherwise disable it).',
      inputSchema: { id },
      handler: guard(({ id: eid }) => client.bookings.deleteEvent(eid)),
    },
    {
      name: 'list_posts',
      description: 'List blog posts (paginated, 15 per page).',
      inputSchema: { page: z.number().int().min(1).optional() },
      handler: guard(({ page } = {}) => client.posts.list(page ?? 1)),
    },
    {
      name: 'get_post',
      description: 'Get a single blog post by id.',
      inputSchema: { id },
      handler: guard(({ id: pid }) => client.posts.get(pid)),
    },
    {
      name: 'create_post',
      description: 'Create a blog post. Defaults to draft unless draft=false.',
      inputSchema: postFields,
      handler: guard((args) => client.posts.create(stripUndefined(args))),
    },
    {
      name: 'update_post',
      description: 'Update a blog post. Only provided fields change; tags replace the full set.',
      inputSchema: { id, ...partial(postFields) },
      handler: guard(({ id: pid, ...rest }) => client.posts.update(pid, stripUndefined(rest))),
    },
  ];

  return tools;
}

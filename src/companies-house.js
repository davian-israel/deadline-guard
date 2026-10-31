// Companies House Public Data API client.
// Docs: https://developer.company-information.service.gov.uk/
// Without CH_API_KEY the client runs in mock mode so the app works in dev/CI.

const BASE = 'https://api.company-information.service.gov.uk';

export function normaliseNumber(input) {
  const s = String(input || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z0-9]{1,8}$/.test(s)) return null;
  // Purely numeric numbers are zero-padded to 8 digits; prefixed (SC, NI, OC…) padded after prefix.
  const m = s.match(/^([A-Z]{2})?(\d+)$/);
  if (!m) return s.length === 8 ? s : null;
  const prefix = m[1] || '';
  return prefix + m[2].padStart(8 - prefix.length, '0');
}

function mapCompany(c) {
  return {
    number: c.company_number,
    name: c.company_name,
    status: c.company_status,
    type: c.type,
    incorporated: c.date_of_creation || null,
    accountsDue: c.accounts?.next_due || null,
    accountsMadeUpTo: c.accounts?.next_made_up_to || null,
    accountsOverdue: Boolean(c.accounts?.overdue),
    csDue: c.confirmation_statement?.next_due || null,
    csOverdue: Boolean(c.confirmation_statement?.overdue),
    locality: c.registered_office_address?.locality || null,
    postcode: c.registered_office_address?.postal_code || null,
  };
}

function mockCompany(number) {
  // Deterministic fake data seeded from the number so pages are stable in dev.
  const seed = [...number].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const today = new Date();
  const add = (days) => new Date(today.getTime() + days * 864e5).toISOString().slice(0, 10);
  return {
    number,
    name: `EXAMPLE TRADING ${seed % 997} LTD`,
    status: 'active',
    type: 'ltd',
    incorporated: '2019-04-01',
    accountsDue: add((seed % 120) - 10),
    accountsMadeUpTo: add((seed % 120) - 280),
    accountsOverdue: (seed % 120) - 10 < 0,
    csDue: add((seed % 200) + 5),
    csOverdue: false,
    locality: 'London',
    postcode: 'EC1A 1BB',
  };
}

export class CompaniesHouse {
  constructor(apiKey = process.env.CH_API_KEY) {
    this.apiKey = apiKey;
    this.mock = !apiKey;
  }

  async #get(path) {
    const res = await fetch(BASE + path, {
      headers: { Authorization: 'Basic ' + Buffer.from(this.apiKey + ':').toString('base64') },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) return null;
    if (res.status === 429) throw Object.assign(new Error('Companies House rate limit'), { status: 429 });
    if (!res.ok) throw new Error(`Companies House ${res.status}`);
    return res.json();
  }

  async getCompany(input) {
    const number = normaliseNumber(input);
    if (!number) return null;
    if (this.mock) return mockCompany(number);
    const data = await this.#get(`/company/${encodeURIComponent(number)}`);
    return data ? mapCompany(data) : null;
  }

  async search(q, limit = 10) {
    const query = String(q || '').trim().slice(0, 100);
    if (!query) return [];
    if (this.mock) {
      return [1, 2, 3].map((i) => {
        const n = normaliseNumber(String(10000000 + query.length * 1000 + i));
        return { number: n, name: `${query.toUpperCase()} ${i} LTD`, status: 'active', address: 'London' };
      });
    }
    const data = await this.#get(`/search/companies?q=${encodeURIComponent(query)}&items_per_page=${limit}`);
    return (data?.items || []).map((i) => ({
      number: i.company_number,
      name: i.title,
      status: i.company_status,
      address: i.address_snippet,
    }));
  }
}

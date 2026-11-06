import request from 'supertest';
import app from '../../app';

describe('ICD-11 API', () => {
  let token: string;
  let fetchSpy: jest.SpyInstance;

  beforeAll(async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ username: 'doctor', password: 'doctor123' });
    token = res.body.token;
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/icd11/search').query({ q: 'diabetes' });
    expect(res.status).toBe(401);
  });

  it('rejects a query shorter than 2 characters', async () => {
    const res = await request(app).get('/api/v1/icd11/search').query({ q: 'd' }).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('fetches a token once and reuses it across searches, stripping highlight markup', async () => {
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'test-token', expires_in: 3600 }) } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          destinationEntities: [
            { theCode: '5A11', title: "<em class='found'>Diabetes</em> mellitus, type 2" },
            { title: 'No code entity' },
          ],
        }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ destinationEntities: [{ theCode: '5A10', title: 'Diabetes mellitus, type 1' }] }),
      } as any);

    const res1 = await request(app).get('/api/v1/icd11/search').query({ q: 'diabetes' }).set('Authorization', `Bearer ${token}`);
    expect(res1.status).toBe(200);
    expect(res1.body).toEqual([{ code: '5A11', title: 'Diabetes mellitus, type 2' }]);

    const res2 = await request(app).get('/api/v1/icd11/search').query({ q: 'diabetes type 1' }).set('Authorization', `Bearer ${token}`);
    expect(res2.status).toBe(200);
    expect(res2.body).toEqual([{ code: '5A10', title: 'Diabetes mellitus, type 1' }]);

    // 1 token fetch + 2 searches — the second search reuses the cached token.
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('returns 502 when the upstream WHO API call fails', async () => {
    // The cached token from the previous test is still valid, so this exercises the search-call failure path.
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: false } as any);
    const res = await request(app).get('/api/v1/icd11/search').query({ q: 'unreachable' }).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(502);
  });

  it('returns 502, not 500, when the ICD-11 service cannot be reached at all', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValueOnce(new TypeError('fetch failed'));
    const res = await request(app).get('/api/v1/icd11/search').query({ q: 'unreachable' }).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(502);
  });

  describe('with a local ICD-API (the offline clinic container)', () => {
    beforeEach(() => {
      process.env.ICD11_API_URL = 'http://icd-api/';
      process.env.ICD11_RELEASE = '2026-01';
    });
    afterEach(() => {
      delete process.env.ICD11_API_URL;
      delete process.env.ICD11_RELEASE;
    });

    it('searches the local service for the configured release, with no WHO token', async () => {
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ destinationEntities: [{ theCode: 'CA23', title: 'Asthma' }] }),
      } as any);

      const res = await request(app).get('/api/v1/icd11/search').query({ q: 'asthma' }).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ code: 'CA23', title: 'Asthma' }]);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(String(url)).toBe('http://icd-api/icd/release/11/2026-01/mms/search?q=asthma');
      expect(init.headers.Authorization).toBeUndefined();
    });

    describe('searching by code', () => {
      const entity = (code: string, title: string, child: string[] = [], classKind = 'category') => ({
        ok: true,
        status: 200,
        json: async () => ({ code, title: { '@language': 'en', '@value': title }, classKind, child }),
      });
      const who = (id: string) => `http://id.who.int/icd/release/11/2026-01/mms/${id}`;

      it('finds the diagnosis for a code and lists its subcategories', async () => {
        const responses: Record<string, any> = {
          'http://icd-api/icd/release/11/2026-01/mms/codeinfo/CA23': { ok: true, status: 200, json: async () => ({ code: 'CA23', stemId: who('100') }) },
          'http://icd-api/icd/release/11/2026-01/mms/100': entity('CA23', 'Asthma', [who('101'), who('102')]),
          'http://icd-api/icd/release/11/2026-01/mms/101': entity('CA23.0', 'Allergic asthma'),
          'http://icd-api/icd/release/11/2026-01/mms/102': entity('CA23.1', 'Non-allergic asthma'),
        };
        fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url) => responses[String(url)] ?? { ok: false, status: 500 });

        // Typed in lower case, as a doctor might.
        const res = await request(app).get('/api/v1/icd11/search').query({ q: 'ca23' }).set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual([
          { code: 'CA23', title: 'Asthma' },
          { code: 'CA23.0', title: 'Allergic asthma' },
          { code: 'CA23.1', title: 'Non-allergic asthma' },
        ]);
      });

      it('falls back to a text search when a code-shaped query is not a code', async () => {
        fetchSpy = jest
          .spyOn(global, 'fetch')
          .mockResolvedValueOnce({ ok: false, status: 404, json: async () => 'XX99 does not exist' } as any)
          .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ destinationEntities: [] }) } as any);

        const res = await request(app).get('/api/v1/icd11/search').query({ q: 'XX99' }).set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
        expect(String(fetchSpy.mock.calls[1][0])).toContain('/mms/search?q=XX99');
      });

      it('does not offer a chapter as a diagnosis', async () => {
        fetchSpy = jest
          .spyOn(global, 'fetch')
          .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ code: '1A00', stemId: who('200') }) } as any)
          .mockResolvedValueOnce(entity('1A00', 'Not a category', [], 'block') as any)
          .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ destinationEntities: [] }) } as any);

        const res = await request(app).get('/api/v1/icd11/search').query({ q: '1A00' }).set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
      });

      it('treats ordinary words as text, not codes', async () => {
        fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ destinationEntities: [{ theCode: 'FA25', title: 'Gout' }] }),
        } as any);

        const res = await request(app).get('/api/v1/icd11/search').query({ q: 'gout' }).set('Authorization', `Bearer ${token}`);
        expect(res.body).toEqual([{ code: 'FA25', title: 'Gout' }]);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(String(fetchSpy.mock.calls[0][0])).toContain('/mms/search?q=gout');
      });
    });

    it('still works when no WHO credentials are configured', async () => {
      const { ICD11_CLIENT_ID, ICD11_CLIENT_SECRET } = process.env;
      delete process.env.ICD11_CLIENT_ID;
      delete process.env.ICD11_CLIENT_SECRET;
      try {
        fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: true, json: async () => ({ destinationEntities: [] }) } as any);
        const res = await request(app).get('/api/v1/icd11/search').query({ q: 'asthma' }).set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
      } finally {
        process.env.ICD11_CLIENT_ID = ICD11_CLIENT_ID;
        process.env.ICD11_CLIENT_SECRET = ICD11_CLIENT_SECRET;
      }
    });
  });
});

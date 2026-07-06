import { SettingsService } from './settings.service';

describe('SettingsService.translatePath', () => {
  const service = new SettingsService(null as never);

  it('translates by longest matching prefix', () => {
    const mappings = [
      { from: '/data', to: '/mnt/user' },
      { from: '/data/media', to: '/media' },
    ];
    expect(service.translatePath('/data/media/movies/a.mkv', mappings)).toBe('/media/movies/a.mkv');
    expect(service.translatePath('/data/other/b.mkv', mappings)).toBe('/mnt/user/other/b.mkv');
  });

  it('returns the path unchanged when nothing matches', () => {
    expect(service.translatePath('/somewhere/c.mkv', [{ from: '/data', to: '/media' }])).toBe(
      '/somewhere/c.mkv',
    );
  });

  it('handles empty mappings', () => {
    expect(service.translatePath('/x/y.mkv', [])).toBe('/x/y.mkv');
  });
});

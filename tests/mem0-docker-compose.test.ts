import { beforeAll, describe, expect, it } from 'vitest';
import { load } from 'js-yaml';

import { read } from './helpers/fs';

type ComposeFile = {
  services: Record<string, Record<string, any>>;
  volumes?: Record<string, unknown>;
  networks?: Record<string, unknown>;
};

describe('mem0 docker-compose stack', () => {
  let compose: ComposeFile;
  let services: ComposeFile['services'];
  let volumes: NonNullable<ComposeFile['volumes']>;
  let networks: NonNullable<ComposeFile['networks']>;

  beforeAll(() => {
    compose = load(read('docker-compose.mem0.yml')) as ComposeFile;
    services = compose.services;
    volumes = compose.volumes ?? {};
    networks = compose.networks ?? {};
  });

  it('provides the mem0 service with development mounts and dependencies', () => {
    const mem0 = services.mem0;
    expect(mem0).toBeDefined();
    expect(mem0.build).toMatchObject({
      context: '..',
      dockerfile: 'server/dev.Dockerfile',
    });
    expect(mem0.ports).toContain('8888:8000');
    expect(mem0.env_file).toContain('.env');
    expect(mem0.networks).toContain('mem0_network');
    expect(mem0.volumes).toEqual(
      expect.arrayContaining([
        './history:/app/history',
        '.:/app',
        '../mem0:/app/packages/mem0',
      ]),
    );
    expect(mem0.depends_on).toMatchObject({
      postgres: { condition: 'service_healthy' },
      neo4j: { condition: 'service_healthy' },
    });
    expect(mem0.command).toBe('uvicorn main:app --host 0.0.0.0 --port 8000 --reload');
    expect(mem0.environment).toEqual(
      expect.arrayContaining([
        'PYTHONDONTWRITEBYTECODE=1',
        'PYTHONUNBUFFERED=1',
      ]),
    );
  });

  it('defines supporting services for qdrant, neo4j, and postgres', () => {
    const { qdrant, neo4j, postgres } = services;
    expect(qdrant).toBeDefined();
    expect(neo4j).toBeDefined();
    expect(postgres).toBeDefined();
    expect(qdrant.networks).toContain('mem0_network');
    expect(neo4j.networks).toContain('mem0_network');
    expect(postgres.networks).toContain('mem0_network');
  });

  it('declares persistent volumes for qdrant and neo4j', () => {
    expect(Object.keys(volumes)).toEqual(
      expect.arrayContaining(['neo4j_data', 'qdrant']),
    );
  });

  it('registers the shared mem0 network', () => {
    expect(networks).toHaveProperty('mem0_network');
  });
});

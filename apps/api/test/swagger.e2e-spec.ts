import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';

describe('Swagger (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the Swagger UI without authentication', () => {
    return request(app.getHttpServer()).get('/api/docs').expect(200).expect('Content-Type', /html/);
  });

  it('documents every route', async () => {
    const { body } = await request(app.getHttpServer()).get('/api/docs-json').expect(200);

    expect(Object.keys(body.paths).sort()).toEqual([
      '/api',
      '/api/auth/login',
      '/api/borrowers',
      '/api/borrowers/{id}',
      '/api/borrowers/{id}/loans',
      '/api/funds',
      '/api/loans',
      '/api/loans/{id}',
    ]);
    expect(Object.keys(body.paths['/api/borrowers'])).toEqual(['post', 'get']);
    expect(Object.keys(body.paths['/api/borrowers/{id}'])).toEqual(['get', 'patch', 'delete']);
    expect(Object.keys(body.paths['/api/borrowers/{id}/loans'])).toEqual(['get']);
    expect(Object.keys(body.paths['/api/funds'])).toEqual(['get']);
    expect(Object.keys(body.paths['/api/loans'])).toEqual(['post']);
    expect(Object.keys(body.paths['/api/loans/{id}'])).toEqual(['get']);
  });

  it('requires bearer auth only on protected routes', async () => {
    const { body } = await request(app.getHttpServer()).get('/api/docs-json').expect(200);

    expect(body.components.securitySchemes.bearer).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
    expect(body.paths['/api/auth/login'].post.security).toBeUndefined();
    expect(body.paths['/api'].get.security).toBeUndefined();
    expect(body.paths['/api/borrowers/{id}'].delete.security).toEqual([{ bearer: [] }]);
  });

  it('marks the CPF as optional in borrower responses', async () => {
    const { body } = await request(app.getHttpServer()).get('/api/docs-json').expect(200);

    const schema = body.components.schemas.BorrowerResponse;
    expect(schema.required).toEqual(
      expect.arrayContaining(['id', 'name', 'createdAt', 'updatedAt']),
    );
    expect(schema.required).not.toContain('cpf');
  });

  it('requires bearer auth on POST /api/loans', async () => {
    const { body } = await request(app.getHttpServer()).get('/api/docs-json').expect(200);

    expect(body.paths['/api/loans'].post.security).toEqual([{ bearer: [] }]);
  });

  it('marks FundResponse.currentVersion as nullable', async () => {
    const { body } = await request(app.getHttpServer()).get('/api/docs-json').expect(200);

    const schema = body.components.schemas.FundResponse;
    expect(schema.properties.currentVersion.nullable).toBe(true);
  });

  it('requires all six fields on CreateLoanDto', async () => {
    const { body } = await request(app.getHttpServer()).get('/api/docs-json').expect(200);

    const schema = body.components.schemas.CreateLoanDto;
    expect(schema.required).toEqual(
      expect.arrayContaining([
        'borrowerId',
        'fundId',
        'principalCents',
        'installmentCount',
        'disbursedAt',
        'graceMonths',
      ]),
    );
    expect(schema.required).toHaveLength(6);
  });
});

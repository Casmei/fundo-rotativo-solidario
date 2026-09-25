import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { BEARER_AUTH } from './shared/swagger/bearer-auth.js';

export const SWAGGER_PATH = 'docs';

export function createSwaggerDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('FRS API')
    .setDescription(
      [
        'API do FRS.',
        '',
        '## Autenticação',
        'Com exceção das rotas marcadas como públicas, todas as rotas exigem um token JWT no header',
        '`Authorization: Bearer <token>`. Obtenha o token em `POST /api/auth/login` e clique em',
        '**Authorize** para usá-lo nas chamadas desta página. O token expira em 7 dias.',
        '',
        '## Perfis',
        '- `back_office`: acesso completo, incluindo criação, edição e remoção de tomadores, leitura do CPF e',
        '  criação de empréstimos.',
        '- `field_agent`: acesso somente leitura; o CPF dos tomadores não é exposto.',
        '',
        'Empréstimos e fundos podem ser consultados por ambos os perfis; apenas `back_office` pode criar',
        'empréstimos.',
        '',
        '## Erros',
        'Erros seguem o formato padrão `{ statusCode, message, error }`. Em erros de validação (400),',
        '`message` é uma lista com uma mensagem por problema encontrado.',
      ].join('\n'),
    )
    .setVersion('0.0.1')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token de acesso retornado por `POST /api/auth/login`.',
      },
      BEARER_AUTH,
    )
    .build();

  return SwaggerModule.createDocument(app, config);
}

export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup(SWAGGER_PATH, app, () => createSwaggerDocument(app), {
    useGlobalPrefix: true,
    customSiteTitle: 'FRS API · Documentação',
    swaggerOptions: { persistAuthorization: true },
  });
}

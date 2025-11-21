/* eslint-disable prettier/prettier */
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common/pipes';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, // Enable automatic transformation using class-transformer
      whitelist: true, // Strip properties that don't have decorators
      forbidNonWhitelisted: false, // Don't throw error for non-whitelisted properties
    }),
  );
  // console.log(process.env.DB_PASSWORD);

  // Define your allowed origins dynamically or explicitly
  const allowedOrigins = [
    'http://localhost:4200', // Your local development frontend
    'https://front-mu-five.vercel.app', // Your Vercel deployed frontend URL
    // If your Vercel frontend generates dynamic preview URLs (e.g., for branches),
    // you might need a more flexible approach using a regex.
    // Example for dynamic Vercel URLs:
    // /https:\/\/front-mu-five(-\w+)?\.vercel\.app$/ // Matches front-mu-five.vercel.app AND front-mu-five-branchname.vercel.app
  ];

  app.enableCors({
    origin: allowedOrigins, // or a list of allowed origins
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    exposedHeaders: ['Content-Disposition'],
  });
  const config = new DocumentBuilder()
    .setTitle('Reports System')
    .setDescription('Documentation for the Reports API')
    .setVersion('1.0')
    .addTag('Reports API')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT || 3000);
}
bootstrap();

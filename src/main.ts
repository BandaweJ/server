/* eslint-disable prettier/prettier */
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common/pipes';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  logger.log('Starting application bootstrap...');
  
  try {
    logger.log('Creating Nest application...');
    const app = await NestFactory.create(AppModule);
    logger.log('Nest application created successfully');
    
    logger.log('Setting up global filters...');
    app.useGlobalFilters(new AllExceptionsFilter());
    logger.log('Global filters configured');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true, // Enable automatic transformation using class-transformer
      whitelist: true, // Strip properties that don't have decorators
      forbidNonWhitelisted: false, // Don't throw error for non-whitelisted properties
    }),
  );

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

    const isProduction = process.env.NODE_ENV === 'production';
    const swaggerEnabled = process.env.SWAGGER_ENABLED === 'true' || !isProduction;
    if (swaggerEnabled) {
      logger.log('Setting up Swagger...');
      const document = SwaggerModule.createDocument(app, config);
      SwaggerModule.setup('api', app, document);
      logger.log('Swagger configured');
    } else {
      logger.log('Swagger disabled for production environment');
    }

    const port = process.env.PORT || 3000;
    logger.log(`Starting server on port ${port}...`);
    await app.listen(port);
    logger.log(`Server started on port ${port}`);
    logger.log('Server is ready to accept requests');
    logger.log(`API available at http://localhost:${port}`);
    if (swaggerEnabled) {
      logger.log(`Swagger docs available at http://localhost:${port}/api`);
    }
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}
bootstrap();

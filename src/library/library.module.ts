import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { TextbookTitleEntity } from './entities/textbook-title.entity';
import { TextbookCopyEntity } from './entities/textbook-copy.entity';
import { TextbookLoanEntity } from './entities/textbook-loan.entity';
import { LibraryService } from './library.service';
import { LibraryController } from './library.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([TextbookTitleEntity, TextbookCopyEntity, TextbookLoanEntity]),
    AuthModule,
  ],
  providers: [LibraryService],
  controllers: [LibraryController],
  exports: [LibraryService],
})
export class LibraryModule {}


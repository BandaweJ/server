import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { RoomEntity } from 'src/inventory/entities/room.entity';
import { TextbookTitleEntity } from './entities/textbook-title.entity';
import { TextbookCopyEntity } from './entities/textbook-copy.entity';
import { TextbookLoanEntity } from './entities/textbook-loan.entity';
import { LibraryService } from './library.service';
import { LibraryController } from './library.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TextbookTitleEntity,
      TextbookCopyEntity,
      TextbookLoanEntity,
      TeachersEntity,
      StudentsEntity,
      RoomEntity,
    ]),
    AuthModule,
  ],
  providers: [LibraryService],
  controllers: [LibraryController],
  exports: [LibraryService],
})
export class LibraryModule {}


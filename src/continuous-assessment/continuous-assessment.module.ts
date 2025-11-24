import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContinuousAssessmentEntity } from './entities/continuous-assessment.entity';
import { ContinuousAssessmentService } from './services/continuous-assessment.service';
import { ContinuousAssessmentController } from './controllers/continuous-assessment.controller';
import { ProfilesModule } from 'src/profiles/profiles.module';
import { AuthModule } from 'src/auth/auth.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { MarksModule } from 'src/marks/marks.module';
import { EnrolmentModule } from 'src/enrolment/enrolment.module';
import { StudentsEntity } from 'src/profiles/entities/students.entity';
import { TeachersEntity } from 'src/profiles/entities/teachers.entity';
import { SubjectsEntity } from 'src/marks/entities/subjects.entity';
import { AccountsEntity } from 'src/auth/entities/accounts.entity';
import { ClassEntity } from 'src/enrolment/entities/class.entity';
import { EnrolEntity } from 'src/enrolment/entities/enrol.entity';
import { TermsEntity } from 'src/enrolment/entities/term.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ContinuousAssessmentEntity,
      StudentsEntity,
      TeachersEntity,
      SubjectsEntity,
      AccountsEntity,
      ClassEntity,
      EnrolEntity,
      TermsEntity,
    ]),
    ProfilesModule,
    forwardRef(() => AuthModule),
    forwardRef(() => NotificationsModule),
    forwardRef(() => MarksModule),
    EnrolmentModule,
  ],
  providers: [ContinuousAssessmentService],
  controllers: [ContinuousAssessmentController],
  exports: [ContinuousAssessmentService],
})
export class ContinuousAssessmentModule {}


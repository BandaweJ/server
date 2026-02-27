import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, PrimaryGeneratedColumn, Unique, OneToMany } from 'typeorm';
import { EnrolEntity } from './enrol.entity';

@Entity('classes')
@Unique(['name'])
export class ClassEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  form: number;

  @OneToMany(() => EnrolEntity, (enrol) => enrol.name)
  enrols: EnrolEntity[];
}

import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { MarksEntity } from './marks.entity';

@Entity('subjects')
export class SubjectsEntity {
  @Column()
  name: string;

  @PrimaryColumn()
  code: string;

  @OneToMany(() => MarksEntity, (mark) => mark.subject)
  marks: MarksEntity[];
}

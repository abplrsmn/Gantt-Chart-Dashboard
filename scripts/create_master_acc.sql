create table if not exists master_acc (
  id bigserial primary key,
  person_id bigint null,
  email varchar(255) not null unique,
  password_plain varchar(255) not null,
  is_admin boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint fk_master_acc_person
    foreign key (person_id)
    references master_people(id)
    on update cascade
    on delete set null
);

alter table master_acc add column if not exists password_plain varchar(255);
alter table master_acc drop column if exists password_hash;

create index if not exists idx_master_acc_email on master_acc (email);
create index if not exists idx_master_acc_person_id on master_acc (person_id);

insert into master_people (employee_code, full_name, nickname, department, job_title, email, is_active)
select 'EMP-ADMIN', 'Dashboard Admin', 'Admin', 'Management', 'Administrator', 'admin@aryaduta.com', true
where not exists (
  select 1 from master_people where lower(email) = lower('admin@aryaduta.com')
);

insert into master_acc (person_id, email, password_plain, is_admin, is_active)
select mp.id, 'admin@aryaduta.com', 'admin123', true, true
from master_people mp
where lower(mp.email) = lower('admin@aryaduta.com')
  and not exists (
    select 1 from master_acc where lower(email) = lower('admin@aryaduta.com')
  );

update master_acc
set password_plain = 'admin123', is_admin = true, is_active = true, updated_at = now()
where lower(email) = lower('admin@aryaduta.com');

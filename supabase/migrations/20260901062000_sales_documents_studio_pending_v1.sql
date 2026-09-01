alter table market.sales_documents alter column storage_path drop not null;
alter table market.sales_documents alter column file_name drop not null;

alter table market.sales_documents
  add constraint sales_documents_available_file_check
  check (status <> 'available' or (storage_path is not null and file_name is not null));

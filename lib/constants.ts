export const RAIL_LINKS = {
  shows: 'https://playnet.redbull.com/admin/content/rails/7b3acc50-d463-412c-92b6-8aa6373bd8dd',
  clips: 'https://playnet.redbull.com/admin/content/rails/ae41fcf3-42dc-4038-8c98-be1bb9b6a371',
} as const;

/**
 * Pro Upload (CSV-Datei oder eingefügter Text) werden nur die ersten 200
 * gültigen Einträge berücksichtigt.
 */
export const MAX_ROWS_PER_UPLOAD = 200;

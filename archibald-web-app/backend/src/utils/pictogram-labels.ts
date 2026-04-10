export type PictogramLabel = {
  symbol:  string;
  labelIt: string;
};

// Maps raw symbols from catalog_entries.pictograms to Italian labels.
// null = skip (already shown elsewhere in the UI, e.g. rpm_max, packaging_units).
// undefined (key absent) = unknown symbol, also skipped.
const PICTOGRAM_MAP: Record<string, string | null> = {
  // ── Indicazioni cliniche ──
  cavity_tooth:               'Preparazione cavità',
  cavity_prep:                'Preparazione cavità',
  cavity_preparation:         'Preparazione cavità',
  crown_prep:                 'Preparazione corona',
  crown_preparation:          'Preparazione corona',
  crown_tooth:                'Preparazione corona',
  crown_and_bridge:           'Corona e bridge',
  crown_bridge:               'Corona e bridge',
  crown_bridge_technique:     'Corona e bridge',
  crown_cut:                  'Rimozione corona',
  crown_removal:              'Rimozione corona',
  root_canal:                 'Preparazione canalare',
  root_canal_prep:            'Preparazione canalare',
  root_canal_preparation:     'Preparazione canalare',
  root_planing:               'Levigatura radicolare',
  implant:                    'Implantologia',
  implantology:               'Implantologia',
  oral_surgery:               'Chirurgia orale',
  oral_surgery_tooth:         'Chirurgia orale',
  orthodontics:               'Ortodonzia',
  orthodontic_bracket:        'Ortodonzia',
  prophylaxis:                'Profilassi',
  prophylaxis_cup:            'Profilassi',
  post_systems:               'Sistemi per perni',
  working_on_fillings:        'Restauri compositi',
  filling_work:               'Restauri compositi',
  removal_old_fillings:       'Rimozione otturazioni',
  // ── Tecnica ──
  acrylic_technique:          'Tecnica acrilica',
  acrylic_teeth:              'Tecnica acrilica',
  milling_technique:          'Fresatura di precisione',
  model_casting:              'Scheletrati',
  model_casting_technique:    'Scheletrati',
  model_fabrication:          'Modelli in gesso',
  bevel_cut:                  'Taglio a smusso',
  bevel_cut_milling:          'Taglio a smusso',
  // ── Caratteristiche geometriche ──
  angle:                      'Angolazione',
  angle_symbol:               'Angolazione',
  cone_angle_45:              'Angolazione 45°',
  diamond_interspersed:       'Rivestimento diamantato',
  diamond_interspersed_edge:  'Bordo diamantato',
  double_sided:               'Doppia affilatura',
  two_grit_double_sided:      'Doppia grana su entrambi i lati',
  cutting_tip:                'Punta tagliente',
  cutting_tip_pointed:        'Punta tagliente acuminata',
  non_cutting_tip_1:          'Punta non tagliente',
  rounded_edges:              'Bordi arrotondati',
  rounded_tip:                'Punta arrotondata',
  end_cutting_only_1:         'Solo taglio frontale',
  end_cutting_only_with_radius: 'Solo taglio frontale con raggio',
  guide_pin_length:           'Segna-profondità',
  upper_side_coated:          'Rivestimento lato superiore',
  lower_side_coated:          'Rivestimento lato inferiore',
  safety_chamfer:             'Smusso di sicurezza',
  swirl_tooth:                'Taglio elicoidale',
  // ── Sterilizzazione / sicurezza ──
  autoclave_134:              'Autoclave 134°C',
  autoclave_134c:             'Autoclave 134°C',
  autoclave_134C:             'Autoclave 134°C',
  thermodisinfector:          'Termodisinfettore',
  ultrasonic_bath:            'Bagno a ultrasuoni',
  no_autoclave:               'Non autoclavabile',
  single_use:                 'Monouso',
  single_use_only:            'Monouso',
  STERILE_R:                  'Sterile',
  do_not_use_damaged:         'Non usare se imballaggio danneggiato',
  keep_away_from_sunlight:    'Proteggere dalla luce',
  // ── Info ──
  further_info:               'Ulteriori informazioni disponibili',
  further_information:        'Ulteriori informazioni disponibili',
  info_i:                     'Ulteriori informazioni disponibili',
  consult_instructions:       "Consultare le istruzioni d'uso",
  // ── Saltati — già mostrati altrove nell'UI ──
  maximum_speed:              null,
  max_speed:                  null,
  recommended_speed:          null,
  opt_speed:                  null,
  packing_unit:               null,
  REF:                        null,
};

export function normalizePictograms(symbols: string[]): PictogramLabel[] {
  const seenLabel = new Set<string>();
  const result: PictogramLabel[] = [];
  for (const symbol of symbols) {
    const labelIt = PICTOGRAM_MAP[symbol];
    if (labelIt == null) continue;        // null (skip) o undefined (sconosciuto)
    if (seenLabel.has(labelIt)) continue; // deduplica per label italiana
    seenLabel.add(labelIt);
    result.push({ symbol, labelIt });
  }
  return result;
}

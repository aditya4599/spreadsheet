// A small order sheet that shows off the main formula features.
// Each entry is [address, what the user would type].

export const SAMPLE_CELLS: [string, string][] = [
  ["A1", "Item"],
  ["B1", "Category"],
  ["C1", "Qty"],
  ["D1", "Unit price"],
  ["E1", "Total"],

  ["A2", "Notebook"], ["B2", "Stationery"], ["C2", "12"], ["D2", "3.5"], ["E2", "=C2*D2"],
  ["A3", "Backpack"], ["B3", "Bags"], ["C3", "3"], ["D3", "45"], ["E3", "=C3*D3"],
  ["A4", "Pens (10)"], ["B4", "Stationery"], ["C4", "8"], ["D4", "6.25"], ["E4", "=C4*D4"],
  ["A5", "Desk lamp"], ["B5", "Electronics"], ["C5", "2"], ["D5", "29.99"], ["E5", "=C5*D5"],
  ["A6", "USB cable"], ["B6", "Electronics"], ["C6", "5"], ["D6", "8"], ["E6", "=C6*D6"],
  ["A7", "Tote bag"], ["B7", "Bags"], ["C7", "4"], ["D7", "12"], ["E7", "=C7*D7"],

  ["G1", "Summary"],
  ["G2", "Total revenue"], ["H2", "=SUM(E2:E7)"],
  ["G3", "Average order"], ["H3", "=ROUND(AVERAGE(E2:E7), 2)"],
  ["G4", "Largest order"], ["H4", "=MAX(E2:E7)"],
  ["G5", "Best seller"], ["H5", "=INDEX(A2:A7, MATCH(H4, E2:E7, 0))"],
  ["G6", "Stationery $"], ["H6", '=SUMIF(B2:B7, "Stationery", E2:E7)'],
  ["G7", "Orders > $50"], ["H7", '=COUNTIF(E2:E7, ">50")'],
  ["G8", "Price lookup"], ["H8", '=VLOOKUP("Backpack", A2:D7, 4, FALSE)'],
  ["G9", "Status"], ["H9", '=IF(H2 >= 300, "On target", "Below target")'],
  ["G10", "Item code"], ["H10", '=UPPER(LEFT(A2, 3)) & "-" & C2'],

  // H12 is left empty on purpose: H13 shows #DIV/0! until a number is typed into H12.
  ["G12", "Stores"],
  ["G13", "Per store"], ["H13", "=ROUND(H2 / H12, 2)"],
];

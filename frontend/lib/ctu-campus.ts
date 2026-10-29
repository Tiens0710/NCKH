/** Campus II reference viewport, not a surveyed boundary or a camera position.
 * https://www.ctu.edu.vn/khu-2.html
 * https://www.openstreetmap.org/way/165716609
 */
export const CTU_CAMPUS = { name: 'Khu II · Đại học Cần Thơ', center: [10.03214, 105.76763] as [number, number], zoom: 16 };
export function campusDiagramPosition(lat: number, lng: number) {
  // Legacy diagram coordinates only; preserve geographic coordinates separately.
  return { x: Math.max(.05, Math.min(.95, .5 + (lng - CTU_CAMPUS.center[1]) / .018)),
    y: Math.max(.05, Math.min(.95, .5 - (lat - CTU_CAMPUS.center[0]) / .012)) };
}

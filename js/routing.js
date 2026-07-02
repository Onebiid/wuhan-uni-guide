/* ============================================
   routing.js — Navigation link generator
   Creates deep links to map apps for directions
   ============================================ */

const Routing = (() => {

  // ---- GCJ-02 coordinate conversion (for accurate navigation in China) ----
  const PI = Math.PI;
  const A  = 6378245.0;
  const EE = 0.00669342162296594323;

  function _isOutOfChina(lng, lat) {
    return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
  }

  function _transformLat(x, y) {
    var ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * PI) + 320.0 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
    return ret;
  }

  function _transformLng(x, y) {
    var ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
    return ret;
  }

  /** WGS-84 → GCJ-02. Returns [lng, lat]. */
  function _wgs84ToGcj02(lng, lat) {
    if (_isOutOfChina(lng, lat)) return [lng, lat];
    var dlat = _transformLat(lng - 105.0, lat - 35.0);
    var dlng = _transformLng(lng - 105.0, lat - 35.0);
    var radlat = lat / 180.0 * PI;
    var magic = Math.sin(radlat);
    magic = 1 - EE * magic * magic;
    var sqrtmagic = Math.sqrt(magic);
    dlat = (dlat * 180.0) / ((A * (1 - EE)) / (magic * sqrtmagic) * PI);
    dlng = (dlng * 180.0) / (A / sqrtmagic * Math.cos(radlat) * PI);
    return [lng + dlng, lat + dlat];
  }

  function isMobile() {
    return /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent);
  }

  function isIOS() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent);
  }

  function isAndroid() {
    return /Android/i.test(navigator.userAgent);
  }

  /**
   * Generate navigation links — converts WGS-84 to GCJ-02
   * so that Amap & Baidu Maps point to the correct location.
   */
  function getNavLinks(place) {
    const name = encodeURIComponent(place.name);
    // WGS-84 → GCJ-02 for accurate China navigation
    const gcj = _wgs84ToGcj02(place.lng, place.lat);
    const gLng = gcj[0];
    const gLat = gcj[1];
    const links = [];

    // 高德地图 web
    links.push({
      label: '🗺️ 高德地图',
      url: `https://uri.amap.com/marker?position=${gLng},${gLat}&name=${name}&callnative=1`,
      primary: true,
    });

    // 高德 native app
    if (isMobile()) {
      if (isIOS()) {
        links.push({
          label: '📱 打开高德地图 App',
          url: `iosamap://viewMap?sourceApplication=whuguide&poiname=${name}&lat=${gLat}&lon=${gLng}&dev=0`,
          primary: true,
        });
      } else if (isAndroid()) {
        links.push({
          label: '📱 打开高德地图 App',
          url: `androidamap://viewMap?sourceApplication=whuguide&poiname=${name}&lat=${gLat}&lon=${gLng}&dev=0`,
          primary: true,
        });
      }
    }

    // 百度地图 (uses BD-09, but its web API auto-converts from GCJ-02)
    links.push({
      label: '🗺️ 百度地图',
      url: `https://api.map.baidu.com/marker?location=${gLat},${gLng}&title=${name}&content=${encodeURIComponent(place.note || '')}&output=html`,
      primary: false,
    });

    // Apple Maps — uses WGS-84, so we pass the original coords
    links.push({
      label: '🗺️ Apple 地图',
      url: `https://maps.apple.com/?ll=${place.lat},${place.lng}&q=${name}`,
      primary: false,
    });

    return links;
  }

  function navigate(place) {
    const gcj = _wgs84ToGcj02(place.lng, place.lat);
    window.open(`https://uri.amap.com/marker?position=${gcj[0]},${gcj[1]}&name=${encodeURIComponent(place.name)}&callnative=1`, '_blank');
  }

  return { getNavLinks, navigate, isMobile };
})();

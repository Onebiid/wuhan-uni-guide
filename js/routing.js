/* ============================================
   routing.js — Navigation link generator
   Creates deep links to map apps for directions
   ============================================ */

const Routing = (() => {

  /**
   * Detect if running on a mobile device
   */
  function isMobile() {
    return /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent);
  }

  /**
   * Detect if iOS
   */
  function isIOS() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent);
  }

  /**
   * Detect if Android
   */
  function isAndroid() {
    return /Android/i.test(navigator.userAgent);
  }

  /**
   * Generate navigation links for a place
   * Returns an array of { label, url } objects
   */
  function getNavLinks(place) {
    const name = encodeURIComponent(place.name);
    const lat = place.lat;
    const lng = place.lng;
    const links = [];

    // Always include 高德地图 web version (works everywhere)
    // 高德 uses GCJ-02 coords, but the difference from WGS-84 is ~100-500m in China
    // For rough navigation this is acceptable
    links.push({
      label: '🗺️ 高德地图',
      url: `https://uri.amap.com/marker?position=${lng},${lat}&name=${name}&callnative=1`,
      primary: true,
    });

    // 高德 native app deep link (works best on mobile)
    if (isMobile()) {
      // iosamap:// for iOS, androidamap:// for Android
      if (isIOS()) {
        links.push({
          label: '📱 打开高德地图 App',
          url: `iosamap://viewMap?sourceApplication=whuguide&poiname=${name}&lat=${lat}&lon=${lng}&dev=0`,
          primary: true,
        });
      } else if (isAndroid()) {
        links.push({
          label: '📱 打开高德地图 App',
          url: `androidamap://viewMap?sourceApplication=whuguide&poiname=${name}&lat=${lat}&lon=${lng}&dev=0`,
          primary: true,
        });
      }
    }

    // 百度地图
    links.push({
      label: '🗺️ 百度地图',
      url: `https://api.map.baidu.com/marker?location=${lat},${lng}&title=${name}&content=${encodeURIComponent(place.note || '')}&output=html`,
      primary: false,
    });

    // Apple Maps (works on Apple devices)
    links.push({
      label: '🗺️ Apple 地图',
      url: `https://maps.apple.com/?ll=${lat},${lng}&q=${name}`,
      primary: false,
    });

    return links;
  }

  /**
   * Open the best navigation option automatically
   */
  function navigate(place) {
    // On mobile, try to open 高德地图 web link (will prompt to open in app)
    const url = `https://uri.amap.com/marker?position=${place.lng},${place.lat}&name=${encodeURIComponent(place.name)}&callnative=1`;
    window.open(url, '_blank');
  }

  return { getNavLinks, navigate, isMobile };
})();

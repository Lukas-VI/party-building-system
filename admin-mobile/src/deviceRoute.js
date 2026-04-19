const MOBILE_BREAKPOINT = 860;

function searchParams() {
  if (typeof window === 'undefined') {
    return new URLSearchParams();
  }
  return new URLSearchParams(window.location.search || '');
}

export function shouldSkipAutoRoute() {
  const params = searchParams();
  return ['1', 'true', 'yes'].includes((params.get('no_redirect') || '').toLowerCase());
}

export function isDesktopDevice() {
  if (typeof window === 'undefined') {
    return false;
  }
  const ua = window.navigator.userAgent || '';
  const uaMobile = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
  return !uaMobile && window.innerWidth > MOBILE_BREAKPOINT;
}

export function mobileToDesktopUrl() {
  if (typeof window === 'undefined') {
    return '/admin/';
  }
  const url = new URL(window.location.href);
  url.pathname = '/admin/';
  url.hash = '';
  return url.toString();
}

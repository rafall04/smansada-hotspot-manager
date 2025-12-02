/**
 * Global Toast Notification Helper
 * Lightweight wrapper around SweetAlert2 for Clean SaaS design
 * @global
 */
/* global Swal */
/* exported showToast */

function showToast(type, message, duration = 3000) {
  const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: duration,
    timerProgressBar: true,
    didOpen: (toast) => {
      toast.addEventListener('mouseenter', Swal.stopTimer);
      toast.addEventListener('mouseleave', Swal.resumeTimer);
    },
    customClass: {
      popup: 'toast-clean',
      timerProgressBar: 'toast-progress-clean'
    }
  });

  const config = {
    success: {
      icon: 'success',
      iconColor: '#10b981',
      background: '#ffffff',
      color: '#1f2937'
    },
    error: {
      icon: 'error',
      iconColor: '#ef4444',
      background: '#ffffff',
      color: '#1f2937'
    },
    warning: {
      icon: 'warning',
      iconColor: '#f59e0b',
      background: '#ffffff',
      color: '#1f2937'
    },
    info: {
      icon: 'info',
      iconColor: '#3b82f6',
      background: '#ffffff',
      color: '#1f2937'
    }
  };

  Toast.fire({
    ...config[type] || config.info,
    title: message
  });
}


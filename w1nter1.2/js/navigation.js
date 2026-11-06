const sidebar = document.getElementById('app-sidebar');
const navigation = document.getElementById('main-navigation');
const toggle = document.getElementById('btn-sidebar-toggle');
const label = toggle?.querySelector('.sidebar-toggle-label');

if (sidebar && navigation && toggle && label) {
    const setSidebarVisible = (visible) => {
        sidebar.hidden = !visible;
        document.body.classList.toggle('sidebar-hidden', !visible);
        toggle.setAttribute('aria-expanded', String(visible));
        label.textContent = visible ? 'Ocultar menú' : 'Mostrar menú';
    };

    toggle.addEventListener('click', () => {
        setSidebarVisible(toggle.getAttribute('aria-expanded') !== 'true');
    });

    document.addEventListener('keydown', (event) => {
        const focusIsInMenu = toggle.contains(event.target) || sidebar.contains(event.target);
        if (event.key === 'Escape' && !sidebar.hidden && focusIsInMenu) {
            setSidebarVisible(false);
            toggle.focus();
        }
    });

    navigation.addEventListener('click', (event) => {
        if (
            window.matchMedia('(max-width: 900px)').matches &&
            event.target instanceof Element &&
            event.target.closest('.tab-btn')
        ) {
            setSidebarVisible(false);
            toggle.focus();
        }
    });
}
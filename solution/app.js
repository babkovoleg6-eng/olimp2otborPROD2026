let checkoutTimer = null;

function initializeCartFromStorage() {
    try {
        const cartData = localStorage.getItem('cart');
        if (!cartData) return [];
        const parsed = JSON.parse(cartData);
        if (Array.isArray(parsed)) {
            if (parsed.length === 0) return [];
            if (typeof parsed[0] === 'object' && parsed[0].id) {
                return parsed.map(item => item.id);
            } else if (typeof parsed[0] === 'string') {
                return parsed;
            }
        }
        return [];
    } catch (error) {
        console.error('Error loading cart from storage:', error);
        return [];
    }
}

const AppState = {
    products: [],
    cart: initializeCartFromStorage(),
    history: JSON.parse(localStorage.getItem('orders') || '[]'),
    profile: JSON.parse(localStorage.getItem('profile') || '{"name":"","email":"","notifications":false}'),
    theme: localStorage.getItem('theme') || 'light',
    searchQuery: '',
    selectedTypes: [],
    purchasedItems: new Set(),
    loading: false
};

(function applyThemeImmediately() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark-theme');
    }
})();

function validateEmail(email) {
    const trimmed = email.trim();
    if (!trimmed) return { isValid: false, message: 'Email is required' };
    
    const parts = trimmed.split('@');
    if (parts.length !== 2) return { isValid: false, message: 'E-mail must contain exactly one @ symbol' };
    if (parts[0].length === 0 || parts[1].length === 0) return { isValid: false, message: 'Invalid email format' };
    
    const domainPart = parts[1];
    const dotParts = domainPart.split('.');
    
    if (dotParts.length !== 2) return { isValid: false, message: 'E-mail must contain exactly one dot after @' };
    if (dotParts[0].length === 0 || dotParts[1].length === 0) return { isValid: false, message: 'Invalid email format' };

    return { isValid: true, message: '' };
}

function init() {
    const path = window.location.pathname;
    const pageName = path.split('/').pop().toLowerCase();
    
    initTheme();
    updateCartBadge();
    
    if (pageName === 'cart' || pageName === 'cart.html') {
        initCartPage();
    } else if (pageName === 'profile' || pageName === 'profile.html') {
        initProfilePage();
    } else if (pageName === 'history' || pageName === 'history.html') {
        initHistoryPage();
    } else {
        if (pageName === '' || pageName === 'index.html' || pageName === '/' || path === '/') {
            initSearch();
            parseURLParams(); 
            renderFilterBar(); 
            initFilters();     
            loadProducts();    
        }
    }
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    AppState.theme = savedTheme;
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark-theme');
    } else {
        document.documentElement.classList.remove('dark-theme');
    }
    
    document.querySelectorAll('[data-test-id="theme-toggle"]').forEach(toggle => {
        toggle.onclick = toggleTheme;
    });
    
    updateThemeIcons();
}

function toggleTheme() {
    if (AppState.theme === 'light') {
        AppState.theme = 'dark';
        document.documentElement.classList.add('dark-theme');
    } else {
        AppState.theme = 'light';
        document.documentElement.classList.remove('dark-theme');
    }
    updateThemeIcons();
    localStorage.setItem('theme', AppState.theme);
}

function updateThemeIcons() {
    const lightIcons = document.querySelectorAll('.theme-icon-light');
    const darkIcons = document.querySelectorAll('.theme-icon-dark');
    if (AppState.theme === 'dark') {
        lightIcons.forEach(icon => icon.style.display = 'none');
        darkIcons.forEach(icon => icon.style.display = 'block');
    } else {
        lightIcons.forEach(icon => icon.style.display = 'block');
        darkIcons.forEach(icon => icon.style.display = 'none');
    }
}

function parseURLParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const search = urlParams.get('search');
    const filters = urlParams.get('filters');
    
    if (search) {
        AppState.searchQuery = search.toLowerCase();
        const searchInput = document.querySelector('[data-test-id="search-input"]');
        if (searchInput) searchInput.value = search;
    }
    
    if (filters) {
        AppState.selectedTypes = filters.split(',');
    }
}

function initSearch() {
    const searchInput = document.querySelector('[data-test-id="search-input"]');
    const suggestions = document.querySelector('[data-test-id="search-suggestions"]');
    if (!searchInput || !suggestions) return;
    
    let searchTimeout;
    
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        AppState.searchQuery = e.target.value.toLowerCase().trim();
        
        if (AppState.searchQuery.length === 0) {
            suggestions.classList.remove('active');
            updateURLParams();
            filterProducts();
            return;
        }
        
        suggestions.innerHTML = '<div class="suggestion-item">Loading...</div>';
        suggestions.classList.add('active');
        
        searchTimeout = setTimeout(() => {
            showSearchSuggestions();
        }, 300);
    });
    
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            suggestions.classList.remove('active');
            updateURLParams(); 
            filterProducts();
        }
    });
    
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !suggestions.contains(e.target)) {
            suggestions.classList.remove('active');
        }
    });
}

function showSearchSuggestions() {
    const suggestions = document.querySelector('[data-test-id="search-suggestions"]');
    if (!suggestions) return;
    
    if (AppState.searchQuery.length === 0) {
        suggestions.classList.remove('active');
        return;
    }
    
    const filtered = AppState.products
        .filter(product => 
            product.title.toLowerCase().includes(AppState.searchQuery) &&
            !AppState.purchasedItems.has(product.id)
        )
        .sort((a, b) => a.title.localeCompare(b.title))
        .slice(0, 3);
    
    if (filtered.length === 0) {
        suggestions.innerHTML = '<div class="suggestion-item">No results found</div>';
    } else {
        suggestions.innerHTML = filtered.map(product => `
            <div class="suggestion-item" data-test-id="suggestion-item" data-id="${product.id}">
                ${product.title}
            </div>
        `).join('');
        
        suggestions.querySelectorAll('.suggestion-item[data-id]').forEach(item => {
            item.addEventListener('click', () => {
                const productId = item.dataset.id;
                const product = AppState.products.find(p => p.id === productId);
                if (product) {
                    document.querySelector('[data-test-id="search-input"]').value = product.title;
                    AppState.searchQuery = product.title.toLowerCase();
                    filterProducts();
                    if (!AppState.purchasedItems.has(productId)) {
                        openProductModal(productId);
                    }
                }
                suggestions.classList.remove('active');
            });
        });
    }
    suggestions.classList.add('active');
}

function renderFilterBar() {
    const filterBar = document.querySelector('.filter-bar');
    if (!filterBar) return;
    
    const types = ['Yacht', 'Plane', 'Mansion', 'Island'];
    
    filterBar.innerHTML = types.map(type => `
        <label class="filter-item">
            <input type="checkbox" value="${type}" 
                ${AppState.selectedTypes.includes(type) ? 'checked' : ''}
                data-test-id="filter">
            ${type}
        </label>
    `).join('');
}

function initFilters() {
    const filterBar = document.querySelector('.filter-bar');
    if (filterBar) {
        filterBar.addEventListener('change', (e) => {
            if (e.target.matches('[data-test-id="filter"]')) {
                const checkboxes = filterBar.querySelectorAll('[data-test-id="filter"]');
                AppState.selectedTypes = Array.from(checkboxes)
                    .filter(cb => cb.checked)
                    .map(cb => cb.value);
                
                updateURLParams();
                filterProducts();
            }
        });
    }
}

function updateURLParams() {
    const params = new URLSearchParams();
    if (AppState.searchQuery) {
        params.set('search', AppState.searchQuery);
    }
    if (AppState.selectedTypes.length > 0) {
        params.set('filters', AppState.selectedTypes.join(','));
    }
    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
}

function filterProducts() {
    const grid = document.querySelector('[data-test-id="product-list"]');
    if (!grid) return;
    
    if (AppState.loading) return;

    const filtered = AppState.products.filter(product => {
        const matchesType = AppState.selectedTypes.length === 0 || 
                        AppState.selectedTypes.includes(product.type);
        const matchesSearch = AppState.searchQuery === '' ||
                            product.title.toLowerCase().includes(AppState.searchQuery);
        return matchesType && matchesSearch;
    });
    
    if (filtered.length === 0) {
        grid.innerHTML = '<div class="empty-state">No assets match your current selection.</div>';
    } else {
        grid.innerHTML = filtered.map(product => {
            const isPurchased = AppState.purchasedItems.has(product.id);
            return `
                <div class="card ${isPurchased ? 'bought' : ''}" 
                    data-test-id="product-card"
                    data-id="${product.id}"
                    ${isPurchased ? '' : 'onclick="openProductModal(\'' + product.id + '\')"'}>
                    <div class="card-img">
                        <img src="${product.image}" alt="${product.title}" loading="lazy">
                        ${isPurchased ? '<div class="bought-badge" data-test-id="bought-badge">BOUGHT</div>' : ''}
                    </div>
                    <div class="card-body">
                        <div class="card-category" data-test-id="product-type">${product.type}</div>
                        <div class="card-title" data-test-id="product-title">${product.title}</div>
                        <div class="card-price" data-test-id="product-price">${formatPrice(product.price)}</div>
                    </div>
                </div>
            `;
        }).join('');
    }
}

function showSkeletons() {
    const grid = document.querySelector('[data-test-id="product-list"]');
    if (!grid) return;
    grid.innerHTML = Array(8).fill(`
        <div class="card skeleton-card" data-test-id="skeleton-card">
            <div class="card-img skeleton"></div>
            <div class="card-body">
                <div class="skeleton-text" style="width: 40px; height: 12px; margin-bottom: 8px;"></div>
                <div class="skeleton-text" style="width: 120px; height: 16px; margin-bottom: 12px;"></div>
                <div class="skeleton-text" style="width: 80px; height: 18px;"></div>
            </div>
        </div>
    `).join('');
}

function loadProducts() {
    AppState.loading = true;
    showSkeletons(); 
    
    async function loadData() {
        try {
            const response = await fetch('data.json');
            
            if (!response.ok) {
                throw new Error('Failed to load');
            }
            
            const data = await response.json();
            AppState.products = data.products;
            initPurchasedItems();
            
            AppState.loading = false;
            filterProducts(); 
            
        } catch (error) {
            console.error('Error loading products:', error);
            AppState.loading = false;
            const grid = document.querySelector('[data-test-id="product-list"]');
            if (grid) {
                grid.innerHTML = '<div class="empty-state" style="color: var(--color-error)" data-test-id="error-message">Failed to load products. Please try again later.</div>';
            }
        }
    }
    
    loadData();
}

function initPurchasedItems() {
    AppState.purchasedItems.clear();
    AppState.history.forEach(order => {
        (order.items || order.products || []).forEach(item => {
            AppState.purchasedItems.add(item.id);
        });
    });
}

function updateCartBadge() {
    const badge = document.getElementById('cart-count');
    if (badge) {
        const count = AppState.cart.length;
        badge.textContent = count > 0 ? count.toString() : '';
        badge.style.display = count > 0 ? 'flex' : 'none';
    }
}

function addToCart(productId) {
    const product = AppState.products.find(p => p.id === productId);
    if (!product) return false;
    
    let cart = JSON.parse(localStorage.getItem('cart') || '[]');
    const alreadyInCart = cart.some(item => {
        if (typeof item === 'object') return item.id === productId;
        return item === productId;
    });
    
    if (!alreadyInCart) {
        const cartItem = {
            id: product.id,
            title: product.title,
            price: product.price,
            image: product.image,
            type: product.type
        };
        cart.push(cartItem);
        localStorage.setItem('cart', JSON.stringify(cart));
        AppState.cart = cart;
        updateCartBadge();
        return true;
    }
    return false;
}

function removeFromCart(productId) {
    let cart = JSON.parse(localStorage.getItem('cart') || '[]');
    cart = cart.filter(item => {
        if (typeof item === 'object') return item.id !== productId;
        return item !== productId;
    });
    localStorage.setItem('cart', JSON.stringify(cart));
    AppState.cart = cart;
    updateCartBadge();
}

function openProductModal(productId) {
    const product = AppState.products.find(p => p.id === productId);
    if (!product) return;
    
    const isInCart = AppState.cart.some(item => (item.id || item) === productId);
    const isPurchased = AppState.purchasedItems.has(productId);
    
    const modalHTML = `
        <div class="modal" data-test-id="modal">
            <div class="modal-content" onclick="event.stopPropagation()">
                <button class="modal-close" data-test-id="modal-close" onclick="closeModal()">
                    <svg width="12" height="12" viewBox="0 0 10 10" fill="none"><path d="M9.16659 0.833496L0.833252 9.16683M0.833252 0.833496L9.16659 9.16683" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <div class="modal-img"><img src="${product.image}" alt="${product.title}"></div>
                <div class="modal-info">
                    <h2 class="modal-title" data-test-id="modal-title">${product.title}</h2>
                    <div class="modal-category">${product.type}</div>
                    <p class="modal-description" data-test-id="modal-description">${product.description}</p>
                    <div class="modal-price" data-test-id="modal-price">${formatPrice(product.price)}</div>
                    ${isPurchased ? '<div class="sold-badge" data-test-id="sold-badge">BOUGHT</div>' : 
                        `<button class="btn btn-primary" data-test-id="${isInCart ? 'remove-from-cart' : 'add-to-cart'}" onclick="toggleCartItem('${productId}')">${isInCart ? 'Remove from cart' : 'Add to cart'}</button>`
                    }
                </div>
            </div>
        </div>
    `;
    const container = document.getElementById('modal-container');
    if (container) {
        container.innerHTML = modalHTML;
        container.querySelector('.modal').addEventListener('click', closeModal);
    }
}

function closeModal() {
    const container = document.getElementById('modal-container');
    if (container) container.innerHTML = '';
}

function toggleCartItem(productId) {
    const button = document.querySelector(`[data-test-id="add-to-cart"], [data-test-id="remove-from-cart"]`);
    const isInCart = AppState.cart.some(item => (item.id || item) === productId);
    
    if (isInCart) {
        button.disabled = true;
        button.textContent = 'Removed';
        removeFromCart(productId);
        setTimeout(() => {
            button.disabled = false;
            button.textContent = 'Add to cart';
            button.setAttribute('data-test-id', 'add-to-cart');
        }, 500); 
        notify('Looking for something better?');
    } else {
        button.disabled = true;
        button.textContent = 'Added';
        addToCart(productId);
        setTimeout(() => {
            button.disabled = false;
            button.textContent = 'Remove from cart';
            button.setAttribute('data-test-id', 'remove-from-cart');
        }, 500);
        notify('Great choice!');
    }
}

function initCartPage() {
    renderCartContent();
    updateCartBadge();
    if (!AppState.products.length) {
        fetch('data.json').then(r => r.json()).then(d => {
            AppState.products = d.products;
            renderCartContent();
        });
    }
}

function renderCartContent() {
    const container = document.getElementById('cart-content');
    if (!container) return;
    
    const cartData = JSON.parse(localStorage.getItem('cart') || '[]');
    
    if (!cartData.length) {
        container.innerHTML = '<div class="empty-state" data-test-id="cart-empty">Cart is empty</div>';
        return;
    }
    
    let cartItems = [];
    if (cartData[0].id) {
        cartItems = cartData;
    } else {
        cartItems = cartData.map(id => AppState.products.find(p => p.id === id)).filter(Boolean);
    }
    
    const total = cartItems.reduce((sum, item) => sum + (item.price || 0), 0);
    const profile = JSON.parse(localStorage.getItem('profile') || '{}');
    const isAuthorized = profile.name && profile.email;
    
    container.innerHTML = `
    <div data-test-id="cart-list">
        ${cartItems.map(item => `
            <div class="cart-item" data-test-id="cart-item">
                <img src="${item.image || ''}" alt="${item.title || ''}" class="cart-item-img">
                <div class="cart-item-info">
                    <div class="cart-item-title" data-test-id="cart-item-title">${item.title || 'No title'}</div>
                    <div class="cart-item-price" data-test-id="cart-item-price">${formatPrice(item.price || 0)}</div>
                </div>
                <button class="cart-remove" data-test-id="cart-remove" data-id="${item.id}">Remove</button>
            </div>
        `).join('')}
    </div>
    <div class="cart-total">
        <div class="cart-total-line"><strong class="cart-total-label">Total: </strong><span class="cart-total-amount" data-test-id="cart-total">${formatPrice(total)}</span></div>
        <div class="cart-total-buttons">
            ${isAuthorized ? 
                `<button class="btn btn-primary" data-test-id="checkout-button">Place order</button>` :
                `<a href="profile.html" class="btn btn-primary">Login to place an order</a>`
            }
        </div>
    </div>`;
    
    container.querySelectorAll('[data-test-id="cart-remove"]').forEach(btn => {
        btn.addEventListener('click', (e) => showRemoveConfirmation(e.currentTarget.dataset.id));
    });
    
    const checkoutBtn = container.querySelector('[data-test-id="checkout-button"]');
    if (checkoutBtn) checkoutBtn.addEventListener('click', handleCheckout);
}

function showRemoveConfirmation(productId) {
    const modalHTML = `
    <div class="modal" data-test-id="modal">
        <div class="confirm-modal" onclick="event.stopPropagation()" data-test-id="remove-confirm-modal">
            <h3 class="confirm-modal-title">Remove Product?</h3>
            <p class="confirm-modal-text">Are you sure you want to remove this from your cart?</p>
            <div class="confirm-modal-buttons">
                <button class="btn confirm-yes" data-test-id="confirm-remove">Yes, remove</button>
                <button class="btn confirm-cancel" data-test-id="cancel-remove" onclick="closeModal()">Cancel</button>
            </div>
        </div>
    </div>`; 
    
    const container = document.getElementById('modal-container');
    if (container) {
        container.innerHTML = modalHTML;
        
        container.querySelector('.modal').addEventListener('click', closeModal);
        
        const yesBtn = container.querySelector('[data-test-id="confirm-remove"]');
        if (yesBtn) {
            yesBtn.addEventListener('click', () => confirmRemove(productId));
        }
    }
}

function confirmRemove(productId) {
    removeFromCart(productId);
    renderCartContent();
    closeModal();
    notify('Item removed');
}

function handleCheckout() {
    const checkoutBtn = document.querySelector('[data-test-id="checkout-button"]');
    if (!checkoutBtn) return;
    
    checkoutBtn.disabled = true;
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-danger';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.setAttribute('data-test-id', 'cancel-checkout-button');
    
    const container = document.querySelector('.cart-total-buttons');
    container.appendChild(cancelBtn);
    
    const statusText = document.createElement('span');
    statusText.textContent = 'Processing...';
    statusText.style.marginRight = '12px';
    statusText.style.alignSelf = 'center';
    container.insertBefore(statusText, cancelBtn);
    
    checkoutTimer = setTimeout(() => {
        createOrder();
        window.location.href = 'history.html';
    }, 1500);
    
    cancelBtn.addEventListener('click', () => {
        clearTimeout(checkoutTimer);
        cancelBtn.remove();
        statusText.remove();
        checkoutBtn.disabled = false;
        notify('Order cancelled');
    });
}

function createOrder() {
    let cart = JSON.parse(localStorage.getItem('cart') || '[]');
    if (!cart.length) return;
    
    let cartItems = [];
    if (cart.length > 0) {
        if (typeof cart[0] === 'string') {
             cartItems = cart.map(id => AppState.products.find(p => p.id === id)).filter(Boolean);
        } else {
             cartItems = cart;
        }
    }
    
    const now = new Date();
    const formattedDate = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
    
    const order = {
        id: `ORD-${Date.now()}`,
        date: formattedDate,
        items: cartItems,
        total: cartItems.reduce((sum, item) => sum + (item.price || 0), 0)
    };
    
    AppState.history.unshift(order);
    localStorage.setItem('orders', JSON.stringify(AppState.history));
    
    AppState.cart = [];
    localStorage.setItem('cart', JSON.stringify([]));
    updateCartBadge();
}

function initProfilePage() {
    const nameInput = document.getElementById('profile-name');
    const emailInput = document.getElementById('profile-email');
    const notificationsInput = document.getElementById('profile-notifications');
    const saveBtn = document.getElementById('profile-save');
    
    if (nameInput) nameInput.value = AppState.profile.name || '';
    if (emailInput) emailInput.value = AppState.profile.email || '';
    if (notificationsInput) notificationsInput.checked = AppState.profile.notifications || false;
    
    if (saveBtn) saveBtn.addEventListener('click', saveProfile);
    
    [nameInput, emailInput].forEach(input => {
        if (input) {
            input.addEventListener('input', () => clearError(input.id.replace('profile-', '')));
        }
    });
}

function showError(fieldId, message) {
    const errorElement = document.getElementById(`profile-${fieldId}-error`);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.add('show');
        const input = document.getElementById(`profile-${fieldId}`);
        if (input) input.classList.add('error');
    }
}

function clearError(fieldId) {
    const errorElement = document.getElementById(`profile-${fieldId}-error`);
    if (errorElement) {
        errorElement.classList.remove('show');
        const input = document.getElementById(`profile-${fieldId}`);
        if (input) input.classList.remove('error');
    }
}

function saveProfile() {
    const nameInput = document.getElementById('profile-name');
    const emailInput = document.getElementById('profile-email');
    const notificationsInput = document.getElementById('profile-notifications');
    
    let isValid = true;
    
    clearError('name');
    clearError('email');
    
    if (!nameInput.value.trim()) {
        showError('name', 'Name is required');
        isValid = false;
    }
    
    const emailValidation = validateEmail(emailInput.value);
    if (!emailValidation.isValid) {
        showError('email', emailValidation.message);
        isValid = false;
    }
    
    if (isValid) {
        AppState.profile = {
            name: nameInput.value.trim(),
            email: emailInput.value.trim(),
            notifications: notificationsInput.checked
        };
        localStorage.setItem('profile', JSON.stringify(AppState.profile));
        notify('Data saved');
    }
}

function initHistoryPage() {
    const container = document.getElementById('orders-content');
    if (!container) return;
    
    const history = JSON.parse(localStorage.getItem('orders') || '[]');
    
    if (!history.length) {
        container.innerHTML = '<div class="empty-state" data-test-id="orders-empty">Order history is empty</div>';
    } else {
        container.innerHTML = history.map(order => `
            <div class="order-item" data-test-id="orders-item">
                <div class="order-header">
                    <div class="order-id">${order.id}</div>
                    <div class="order-date">${order.date}</div>
                </div>
                <div class="order-products">
                    ${((order.items || order.products || [])).map(item => `<div class="order-product">${item.title}</div>`).join('')}
                </div>
                <div class="order-total">${formatPrice(order.total)}</div>
            </div>
        `).join('');
    }
}

function formatPrice(price) {
    return '$' + new Intl.NumberFormat('en-US').format(price);
}

function notify(message) {
    const container = document.getElementById('notifications');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = 'toast fade-in';
    toast.textContent = message;
    toast.setAttribute('data-test-id', 'notification');
    
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 1500);
}

document.addEventListener('DOMContentLoaded', init);
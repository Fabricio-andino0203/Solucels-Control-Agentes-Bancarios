document.addEventListener('DOMContentLoaded', () => {
    const moneyInputs = document.querySelectorAll('.money-input');

    moneyInputs.forEach(input => {
        // Formatear al cargar si ya tiene valor
        if (input.value) {
            input.value = formatCurrency(input.value);
        }

        input.addEventListener('input', (e) => {
            let value = e.target.value.replace(/[^0-9.]/g, '');
            
            // Prevenir múltiples puntos decimales
            const parts = value.split('.');
            if (parts.length > 2) value = parts[0] + '.' + parts.slice(1).join('');

            // No formatear mientras escriben el punto decimal
            if (value.endsWith('.')) return;

            if (value) {
                const numericValue = parseFloat(value);
                if (!isNaN(numericValue)) {
                    e.target.value = formatCurrency(value);
                }
            }
        });

        input.addEventListener('blur', (e) => {
            let value = e.target.value.replace(/[^0-9.]/g, '');
            if (value) {
                e.target.value = formatCurrency(parseFloat(value).toFixed(2));
            }
        });

        // Limpiar para envío de formulario
        const form = input.closest('form');
        if (form) {
            form.addEventListener('submit', () => {
                const rawValue = input.value.replace(/[^0-9.]/g, '');
                input.value = rawValue;
            });
        }
    });

    function formatCurrency(value) {
        if (!value) return '';
        let num = value.toString().replace(/[^0-9.]/g, '');
        if (!num) return '';
        
        const parts = num.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        
        let formatted = 'L ' + parts[0];
        if (parts.length > 1) {
            formatted += '.' + parts[1].substring(0, 2);
        }
        return formatted;
    }
});

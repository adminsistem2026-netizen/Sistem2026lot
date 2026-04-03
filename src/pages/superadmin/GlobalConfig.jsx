import { useEffect, useState } from 'react';
import { db } from '../../lib/insforge';

const DEFAULT_CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'Dólar Americano', decimal_places: 2 },
  { code: 'PAB', symbol: 'B/.', name: 'Balboa Panameño', decimal_places: 2 },
  { code: 'NIO', symbol: 'C$', name: 'Córdoba Nicaragüense', decimal_places: 2 },
  { code: 'CRC', symbol: '₡', name: 'Colón Costarricense', decimal_places: 0 },
  { code: 'HNL', symbol: 'L', name: 'Lempira Hondureño', decimal_places: 2 },
];

export default function GlobalConfig() {
  const [currencies, setCurrencies] = useState([]);
  const [defaultCurrency, setDefaultCurrency] = useState('USD');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await db
        .from('system_config')
        .select('*')
        .in('config_key', ['available_currencies', 'default_currency']);

      if (data) {
        const avail = data.find(d => d.config_key === 'available_currencies');
        const def = data.find(d => d.config_key === 'default_currency');
        if (avail) setCurrencies(avail.config_value);
        if (def) setDefaultCurrency(def.config_value.code);
      }
      setLoading(false);
    }
    load();
  }, []);

  function toggleCurrency(code) {
    setCurrencies(prev => {
      const exists = prev.find(c => c.code === code);
      if (exists) {
        if (code === defaultCurrency) return prev; // no quitar la default
        return prev.filter(c => c.code !== code);
      } else {
        const toAdd = DEFAULT_CURRENCIES.find(c => c.code === code);
        return [...prev, toAdd];
      }
    });
  }

  async function handleSave() {
    setSaving(true);
    const defCurrency = currencies.find(c => c.code === defaultCurrency) || currencies[0];

    await db.from('system_config')
      .update({ config_value: currencies })
      .eq('config_key', 'available_currencies');

    await db.from('system_config')
      .update({ config_value: defCurrency })
      .eq('config_key', 'default_currency');

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) return <p className="text-center text-gray-400 text-sm py-10">Cargando...</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-800 mt-2">Configuración Global</h1>

      <div className="bg-white rounded-xl shadow-sm p-4 space-y-4">
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-3">Monedas disponibles en el sistema</p>
          <div className="space-y-2">
            {DEFAULT_CURRENCIES.map(currency => {
              const active = currencies.some(c => c.code === currency.code);
              const isDefault = currency.code === defaultCurrency;
              return (
                <div key={currency.code} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleCurrency(currency.code)}
                      className={`w-10 h-6 rounded-full transition-colors relative ${active ? 'bg-gray-900' : 'bg-gray-200'}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${active ? 'left-5' : 'left-1'}`} />
                    </button>
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {currency.symbol} — {currency.name}
                      </p>
                      <p className="text-xs text-gray-400">{currency.code}</p>
                    </div>
                  </div>
                  {active && (
                    <button
                      onClick={() => setDefaultCurrency(currency.code)}
                      className={`text-xs px-2 py-1 rounded-full border transition ${isDefault ? 'border-gray-900 text-gray-900 font-semibold' : 'border-gray-200 text-gray-400 hover:border-gray-400'}`}
                    >
                      {isDefault ? 'Default' : 'Usar default'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-gray-900 text-white py-3 rounded-xl text-sm font-semibold hover:bg-gray-700 transition disabled:opacity-50"
      >
        {saving ? 'Guardando...' : saved ? '¡Guardado!' : 'Guardar cambios'}
      </button>
    </div>
  );
}

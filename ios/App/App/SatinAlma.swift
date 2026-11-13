import Capacitor
import StoreKit

/// Ana görünüm denetleyicisi: Capacitor köprüsüne yerel Plus eklentisini kaydeder.
/// Main.storyboard CAPBridgeViewController yerine bunu kullanır. Eklenti bu dosyada,
/// uygulamanın içindedir (npm paketi yok); Capacitor yalnızca registerPluginInstance ister.
class AnaGorunum: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SatinAlmaPlugin())
    }
}

/// Tek ürünlük StoreKit 2 köprüsü: "Plus" (tüketilmeyen satın alma).
/// Ürün kimliği burada sabittir, JS'ten kabul edilmez (web görünümü hangi ürünün sorgulanacağını
/// belirleyemez). JS: window.Capacitor.Plugins.SatinAlma
@objc(SatinAlmaPlugin)
public class SatinAlmaPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SatinAlmaPlugin"
    public let jsName = "SatinAlma"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "durum", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "fiyat", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "satinAl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "geriYukle", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "vitrin", returnType: CAPPluginReturnPromise),
    ]

    /// App Store Connect'teki ürün kimliği (paket kimliği + ".plus"; testle denetlenir).
    private let urun = "com.sozcukyolu.sozcukmerdiveni.plus"
    private var dinleyici: Task<Void, Never>?

    /// Ürün şu an geçerli mi: Apple imzası doğrulanmış ve iade/iptal edilmemiş işlem var.
    private func sahip() async -> Bool {
        if case .verified(let islem)? = await Transaction.currentEntitlement(for: urun) {
            return islem.revocationDate == nil
        }
        return false
    }

    /// Uygulama dışında tamamlanan işlemler (ebeveyn onayı, başka cihaz, iade) buradan gelir.
    private func dinle() {
        guard dinleyici == nil else { return }
        dinleyici = Task { [weak self] in
            for await sonuc in Transaction.updates {
                guard case .verified(let islem) = sonuc, islem.productID == self?.urun else { continue }
                await islem.finish()
                guard let self else { return }
                self.notifyListeners("plus", data: ["plus": await self.sahip()])
            }
        }
    }

    /// { plus: Bool }. Açılışta StoreKit'ten yeniden doğrulamak için.
    @objc func durum(_ call: CAPPluginCall) {
        dinle()
        Task { [self] in call.resolve(["plus": await sahip()]) }
    }

    /// { fiyat: String }. Apple'ın yerelleştirilmiş fiyat metni (örn. "₺99,99"); elle yazılmaz.
    @objc func fiyat(_ call: CAPPluginCall) {
        Task { [self] in
            do {
                guard let bilgi = try await Product.products(for: [urun]).first else {
                    return call.reject("Ürün bulunamadı")
                }
                call.resolve(["fiyat": bilgi.displayPrice])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    /// { sonuc: "tamam" | "bekliyor" | "iptal" | "dogrulanamadi" }
    @objc func satinAl(_ call: CAPPluginCall) {
        dinle()
        Task { [self] in
            do {
                guard let bilgi = try await Product.products(for: [urun]).first else {
                    return call.reject("Ürün bulunamadı")
                }
                switch try await bilgi.purchase() {
                case .success(let sonuc):
                    guard case .verified(let islem) = sonuc else { return call.resolve(["sonuc": "dogrulanamadi"]) }
                    await islem.finish()
                    call.resolve(["sonuc": "tamam"])
                case .pending:
                    call.resolve(["sonuc": "bekliyor"])
                default:
                    call.resolve(["sonuc": "iptal"])
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    /// { plus: Bool }. Apple kimliğiyle eşitler (giriş istenebilir), sonra durumu okur.
    @objc func geriYukle(_ call: CAPPluginCall) {
        dinle()
        Task { [self] in
            do { try await AppStore.sync() } catch { return call.reject(error.localizedDescription) }
            call.resolve(["plus": await sahip()])
        }
    }

    /// { ulke?: String }. App Store vitrininin ülke kodu (ISO 3166 alfa-3, örn. "GBR");
    /// Birleşik Krallık'ta reklam etiketi için kullanılır. Vitrin yoksa alan yok.
    @objc func vitrin(_ call: CAPPluginCall) {
        Task {
            let ulke = await Storefront.current?.countryCode
            call.resolve(ulke.map { ["ulke": $0] } ?? [:])
        }
    }
}

import Foundation

struct AppConfiguration {
    enum ConfigurationError: LocalizedError {
        case missingValue(String)
        case invalidBaseURL
        case insecureBaseURL
        case baseHostNotAllowed

        var errorDescription: String? {
            switch self {
            case .missingValue(let key): return "Required build setting \(key) is missing."
            case .invalidBaseURL: return "DriverHubBaseURL is not a valid absolute URL."
            case .insecureBaseURL: return "DriverHubBaseURL must use HTTPS."
            case .baseHostNotAllowed: return "The configured DriverHub host is not in DriverHubAllowedHosts."
            }
        }
    }

    let baseURL: URL
    let environmentName: String
    let allowedHosts: Set<String>
    let authenticationHosts: Set<String>

    static func load(bundle: Bundle = .main) throws -> AppConfiguration {
        guard let rawURL = bundle.object(forInfoDictionaryKey: "DriverHubBaseURL") as? String,
              !rawURL.isEmpty else {
            throw ConfigurationError.missingValue("DriverHubBaseURL")
        }
        guard let baseURL = URL(string: rawURL), baseURL.host != nil else {
            throw ConfigurationError.invalidBaseURL
        }
        guard baseURL.scheme?.lowercased() == "https" else {
            throw ConfigurationError.insecureBaseURL
        }

        let environment = (bundle.object(forInfoDictionaryKey: "DriverHubEnvironment") as? String) ?? "Unknown"
        let configured = (bundle.object(forInfoDictionaryKey: "DriverHubAllowedHosts") as? String) ?? ""
        let hosts = Set(configured.split(separator: ",").map {
            $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        }.filter { !$0.isEmpty })
        let configuredAuthenticationHosts =
            (bundle.object(forInfoDictionaryKey: "DriverHubAuthenticationHosts") as? String) ?? ""
        let authenticationHosts = Set(configuredAuthenticationHosts.split(separator: ",").map {
            $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        }.filter { !$0.isEmpty })

        guard let baseHost = baseURL.host?.lowercased(), hosts.contains(baseHost) else {
            throw ConfigurationError.baseHostNotAllowed
        }
        return AppConfiguration(
            baseURL: baseURL,
            environmentName: environment,
            allowedHosts: hosts,
            authenticationHosts: authenticationHosts
        )
    }

    var isProduction: Bool {
        environmentName.caseInsensitiveCompare("Production") == .orderedSame
    }

    func isInternal(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "https", let host = url.host?.lowercased() else {
            return false
        }
        return allowedHosts.contains(host)
    }

    func isAuthentication(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "https", let host = url.host?.lowercased() else {
            return false
        }
        return authenticationHosts.contains(host)
    }

    func isAllowedInWebView(_ url: URL) -> Bool {
        isInternal(url) || isAuthentication(url)
    }
}
using Microsoft.Identity.Client;
using Microsoft.Identity.Web;

namespace Neox.Extensions.EntraId;

public static class EntraConsentException {

    public static bool TryTranslate(Exception exception, out EntraConsentProblem problem) {
        ArgumentNullException.ThrowIfNull(exception);

        var claims = FindClaims(exception);
        var scopes = FindScopes(exception);
        var errorCode = FindErrorCode(exception);
        var description = exception.Message;

        if (!string.IsNullOrWhiteSpace(claims)) {
            problem = new EntraConsentProblem("claims_challenge", description, scopes, claims, null);
            return true;
        }

        if (Contains(exception, "AADSTS65004") || errorCode is "access_denied") {
            problem = new EntraConsentProblem("consent_denied", description, scopes, null, null);
            return true;
        }

        if (Contains(exception, "AADSTS65001") || Contains(exception, "AADSTS90094")) {
            problem = new EntraConsentProblem("admin_consent_required", description, scopes, null, null);
            return true;
        }

        if (errorCode is "consent_required") {
            problem = new EntraConsentProblem("consent_required", description, scopes, null, null);
            return true;
        }

        if (errorCode is "interaction_required" or "login_required" || exception is MsalUiRequiredException) {
            problem = new EntraConsentProblem("interaction_required", description, scopes, null, null);
            return true;
        }

        problem = null!;
        return false;
    }

    private static bool Contains(Exception exception, string value) {
        for (Exception? current = exception; current is not null; current = current.InnerException) {
            if (current.Message.Contains(value, StringComparison.Ordinal)) {
                return true;
            }
        }

        return false;
    }

    private static string? FindClaims(Exception exception) {
        for (Exception? current = exception; current is not null; current = current.InnerException) {
            if (current is MsalUiRequiredException ui && !string.IsNullOrWhiteSpace(ui.Claims)) {
                return ui.Claims;
            }
        }

        return null;
    }

    private static string? FindErrorCode(Exception exception) {
        for (Exception? current = exception; current is not null; current = current.InnerException) {
            if (current is MsalServiceException service && !string.IsNullOrWhiteSpace(service.ErrorCode)) {
                return service.ErrorCode;
            }
        }

        return null;
    }

    private static IReadOnlyList<string> FindScopes(Exception exception) {
        for (Exception? current = exception; current is not null; current = current.InnerException) {
            if (current is MicrosoftIdentityWebChallengeUserException challenge && challenge.Scopes is { Length: > 0 }) {
                return challenge.Scopes;
            }
        }

        return [];
    }
}

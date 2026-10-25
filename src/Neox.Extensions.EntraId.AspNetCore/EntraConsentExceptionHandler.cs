using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Neox.Extensions.EntraId;

public sealed class EntraConsentExceptionHandler : IExceptionHandler {

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken) {
        ArgumentNullException.ThrowIfNull(httpContext);
        ArgumentNullException.ThrowIfNull(exception);

        var translated = EntraConsentException.TryTranslate(exception, out var problem);

        if (translated && problem.Code is "admin_consent_required" or "consent_required") {
            var defaultScope = MiddleTierDefaultScope(httpContext);

            if (defaultScope is not null) {
                problem = problem with
                {
                    Code = "consent_required",
                    Scopes = [defaultScope],
                };
            }
        }

        if (!translated) {
            return false;
        }

        httpContext.Response.StatusCode = StatusCodes.Status401Unauthorized;
        await httpContext.Response.WriteAsJsonAsync(problem, cancellationToken).ConfigureAwait(false);
        return true;
    }

    private static string? MiddleTierDefaultScope(HttpContext httpContext) {
        var clientId = httpContext.RequestServices.GetRequiredService<IConfiguration>()["AzureAd:ClientId"];

        if (string.IsNullOrWhiteSpace(clientId)) {
            return null;
        }

        return $"api://{clientId}/.default";
    }
}

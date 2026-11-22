using System.Reflection;
using Microsoft.Identity.Client;
using Microsoft.Identity.Web;

namespace Neox.Extensions.EntraId.AspNetCore.Tests;

internal static class ConsentExceptionFactory {

    public static MicrosoftIdentityWebChallengeUserException Challenge(MsalUiRequiredException inner, params string[] scopes) {
        return new MicrosoftIdentityWebChallengeUserException(inner, scopes);
    }

    public static MsalUiRequiredException Ui(string errorCode, string message, string? claims = null) {
        var exception = new MsalUiRequiredException(errorCode, message);

        if (claims is not null) {
            typeof(MsalUiRequiredException)
                .GetProperty(nameof(MsalUiRequiredException.Claims), BindingFlags.Instance | BindingFlags.Public)!
                .SetValue(exception, claims);
        }

        return exception;
    }
}

using Neox.Aspire.Hosting.Azure;

namespace Neox.Extensions.EntraId.Manuals.AppHost;

internal static class Auth {
    public static IResourceBuilder<AzureEntraIdAppRegistrationResource> Registration { get; private set; } = null!;
    public static IResourceBuilder<AzureEntraIdSpaApplicationResource> SpaApp { get; private set; } = null!;
    public static IResourceBuilder<AzureEntraIdWebApplicationResource> WebApp { get; private set; } = null!;

    public static void Configure(IDistributedApplicationBuilder builder) {
        Registration = builder.AddAzureAppRegistration(ServiceNames.Auth.Registration)
            .WithDisplayName("Entra manuals")
            .WithSupportedAccountType(SupportedAccountType.AzureADMyOrg)
            .WithDefaultIdentifierUri()
            .WithPermission(MicrosoftGraph.Delegated.Openid)
            .WithPermission(MicrosoftGraph.Delegated.Profile)
            .WithPermission(MicrosoftGraph.Delegated.OfflineAccess)
            .WithPermission(MicrosoftGraph.Delegated.UserRead)
            .WithPermission(MicrosoftGraph.Delegated.UserReadAll);

        var accessAsUser = Registration.AddScope(
            $"{ServiceNames.Auth.Registration}-access-as-user",
            "access_as_user",
            "Access as user.",
            "Access as user.",
            "Access as user.",
            "Access as user.");

        Registration.WithPermission(accessAsUser);

        SpaApp = Registration.AddSpaApplication(ServiceNames.Auth.Spa)
            .WithRedirectUri(new Uri("http://localhost:5173/"));
        WebApp = Registration.AddWebApplication(ServiceNames.Auth.Web)
            .WithRedirectUri(new Uri("https://localhost/signin-oidc"));
    }
}

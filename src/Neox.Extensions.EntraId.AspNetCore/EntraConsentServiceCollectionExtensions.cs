using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;

namespace Neox.Extensions.EntraId;

public static class EntraConsentServiceCollectionExtensions {

    public static IServiceCollection AddEntraConsentExceptions(this IServiceCollection services) {
        ArgumentNullException.ThrowIfNull(services);

        services.AddProblemDetails();
        services.AddExceptionHandler<EntraConsentExceptionHandler>();
        services.AddScoped<EntraConsentExceptionFilter>();
        services.Configure<MvcOptions>(options => options.Filters.Add<EntraConsentExceptionFilter>());

        return services;
    }
}
